#!/usr/bin/env python3
"""Audit feed: delete empty-content winners from articles; translate English bodies to Chinese."""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def rest(method: str, path: str, *, body: object | None = None, service: bool = False) -> object:
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"] if service else os.environ["SUPABASE_ANON_KEY"]
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/rest/v1/{path}",
        data=data,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {path} -> {e.code}: {err[:500]}") from e


def is_mostly_english(text: str) -> bool:
    if not text or not text.strip():
        return False
    letters = sum(1 for ch in text if ("A" <= ch <= "Z") or ("a" <= ch <= "z"))
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    return letters > 80 and letters > cjk * 2


def strip_markdown_noise(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"__(.*?)__", r"\1", text)
    text = re.sub(r"`{1,3}", "", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def deepseek_chat(messages: list[dict], *, max_tokens: int = 8192) -> str:
    api_key = os.environ["DEEPSEEK_API_KEY"]
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
    payload = {"model": model, "temperature": 0.2, "messages": messages, "max_tokens": max_tokens}
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    last_err = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.load(resp)
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
            req = urllib.request.Request(
                f"{base}/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                method="POST",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            )
    raise RuntimeError(f"deepseek failed: {last_err}")


def translate_field(label: str, text: str) -> str:
    text = (text or "").strip()
    if not text:
        return text
    if not is_mostly_english(text) and sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff") > 10:
        return strip_markdown_noise(text)
    max_chunk = 5500
    if len(text) <= max_chunk:
        chunks = [text]
    else:
        chunks, buf, n = [], [], 0
        for para in text.split("\n\n"):
            if n + len(para) + 2 > max_chunk and buf:
                chunks.append("\n\n".join(buf))
                buf, n = [para], len(para)
            else:
                buf.append(para)
                n += len(para) + 2
        if buf:
            chunks.append("\n\n".join(buf))
    out = []
    for i, chunk in enumerate(chunks):
        sys.stderr.write(f"  translate {label} chunk {i+1}/{len(chunks)} ({len(chunk)} chars)\n")
        sys.stderr.flush()
        zh = deepseek_chat(
            [
                {
                    "role": "system",
                    "content": (
                        "你是新闻译者。把用户给出的英文内容准确译成简体中文。"
                        "保留事实与语气，去掉残留 markdown（#、**、链接括号等）。"
                        "只输出译文，不要前言后语。"
                    ),
                },
                {"role": "user", "content": chunk},
            ]
        )
        out.append(strip_markdown_noise(zh))
        time.sleep(0.35)
    return "\n\n".join(out)


def delete_article_and_cluster(article_id: str, cluster_id: str) -> None:
    """feed_articles is a view; delete underlying articles/clusters via temp winner swap."""
    temp = f"audit_temp_{article_id[:12]}"
    siblings = rest("GET", f"articles?cluster_id=eq.{cluster_id}&select=id", service=True)
    assert isinstance(siblings, list)
    other = [s["id"] for s in siblings if s["id"] != article_id]
    if other:
        rest("PATCH", f"clusters?id=eq.{cluster_id}", body={"winner_id": other[0]}, service=True)
        rest("DELETE", f"articles?id=eq.{article_id}", service=True)
        # if no remaining winners needed — leave other articles; view shows other winner
        return
    rest(
        "POST",
        "articles",
        body={
            "id": temp,
            "source": "aihot",
            "title": "临时占位（待删）",
            "summary": "",
            "content": "占位",
            "url": f"https://example.com/anthreed-audit-temp/{temp}",
            "cluster_id": cluster_id,
            "also_covered_by": [],
            "is_fixture": True,
        },
        service=True,
    )
    rest("PATCH", f"clusters?id=eq.{cluster_id}", body={"winner_id": temp}, service=True)
    rest("DELETE", f"articles?id=eq.{article_id}", service=True)
    rest("DELETE", f"clusters?id=eq.{cluster_id}", service=True)
    rest("DELETE", f"articles?id=eq.{temp}", service=True)


def main() -> int:
    load_env()
    for k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DEEPSEEK_API_KEY"):
        if not os.environ.get(k):
            print(f"missing {k}", file=sys.stderr)
            return 1

    rows = rest("GET", "feed_articles?select=*&order=published_at.desc.nullslast")
    assert isinstance(rows, list)
    print(f"fetched {len(rows)} feed rows")

    deleted = 0
    translated = 0
    skipped_zh = 0
    report = {"deleted": [], "translated": [], "skipped_zh": []}

    for row in rows:
        rid = row["id"]
        content = (row.get("content") or "").strip()
        if not content:
            print(f"DELETE empty {rid} {(row.get('title') or '')[:50]}")
            delete_article_and_cluster(rid, row["cluster_id"])
            deleted += 1
            report["deleted"].append(rid)
            continue

        needs = is_mostly_english(content) or is_mostly_english(row.get("summary") or "")
        if not needs and is_mostly_english(row.get("title") or ""):
            needs = True

        if not needs:
            cleaned = strip_markdown_noise(content)
            if cleaned != content:
                rest("PATCH", f"articles?id=eq.{rid}", body={"content": cleaned}, service=True)
            skipped_zh += 1
            report["skipped_zh"].append(rid)
            continue

        print(f"TRANSLATE {rid} {(row.get('title') or '')[:60]}")
        new_title = row.get("title") or ""
        new_summary = row.get("summary") or ""
        if is_mostly_english(new_title):
            new_title = translate_field("title", new_title)
        if is_mostly_english(new_summary):
            new_summary = translate_field("summary", new_summary)
        new_content = translate_field("content", content)

        patch = {"content": new_content}
        if new_title and new_title != (row.get("title") or ""):
            patch["title"] = new_title
        if new_summary != (row.get("summary") or ""):
            patch["summary"] = new_summary
        rest("PATCH", f"articles?id=eq.{rid}", body=patch, service=True)
        translated += 1
        report["translated"].append(rid)

    after = rest("GET", "feed_articles?select=id,title,summary,content")
    assert isinstance(after, list)
    still_empty = sum(1 for r in after if not (r.get("content") or "").strip())
    still_english = sum(1 for r in after if is_mostly_english(r.get("content") or ""))

    summary = {
        "total_remaining": len(after),
        "translated": translated,
        "deleted": deleted,
        "still_empty": still_empty,
        "still_english": still_english,
        "already_chinese_or_mixed": skipped_zh,
        "ids": report,
    }
    out_path = ROOT / "qa" / "feed-audit-report.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if still_empty == 0 and still_english == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
