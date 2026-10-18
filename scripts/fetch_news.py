#!/usr/bin/env python3
"""
多源新闻聚合爬虫 (Anthreed)
支持: BBC中文、纽约时报中文
特点: 专注于高质量深度报道，支持 AI 摘要和优先级标记
"""

import requests
import feedparser
import json
import os
import sys
import argparse
import time
import re
from datetime import datetime
from typing import List, Dict, Optional
import opencc
import html2text
from bs4 import BeautifulSoup

# Try to import supabase
try:
    from supabase import create_client, Client
except ImportError:
    create_client = None

# 初始化转换器
cc = opencc.OpenCC('t2s')  # 繁体转简体

# ==================== 配置区 ====================

NEWS_SOURCES = {
    # --- 国际新闻 (RSS) ---
    'bbc_chinese': {
        'name': 'BBC中文',
        'category': 'international',
        'type': 'rss',
        'url': 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml',
        'source_id': 'news_international',
    },
    'nytimes_chinese': {
        'name': '纽约时报中文',
        'category': 'international',
        'type': 'rss',
        'url': 'https://cn.nytimes.com/rss/',
        'source_id': 'news_international',
    },
}

# 优先级关键词
HIGH_PRIORITY_KEYWORDS = [
    '政治', '经济', '政策', 'GDP', '贸易', '选举',
    'AI', '人工智能', '芯片', '半导体', 'GPT', 'LLM',
    'Apple', 'Google', 'Microsoft', 'OpenAI', 'Huawei',
    '裁员', '融资', '上市', '重大', '突发', '深度', '调查'
]

# ==================== 核心功能 ====================

def clean_html(html_content: str) -> str:
    """简单的 HTML 清理"""
    if not html_content:
        return ""
    text = re.sub(r'<(script|style).*?>.*?</\1>', '', html_content, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def convert_to_simplified(text: str) -> str:
    """繁体转简体"""
    if not text: return ""
    return cc.convert(text)

def calculate_priority(title: str, category: str) -> str:
    """计算文章优先级"""
    # 国际深度报道默认较高
    if category in ['international']:
        base_score = 1
    else:
        base_score = 0

    # 关键词匹配
    for kw in HIGH_PRIORITY_KEYWORDS:
        if kw.lower() in title.lower():
            return 'high'

    return 'high' if base_score > 0 else 'low'

def fetch_rss_news(source_key: str, limit: int = 10) -> List[Dict]:
    """抓取 RSS 新闻源"""
    config = NEWS_SOURCES[source_key]
    print(f"📡 正在抓取 RSS: {config['name']}...", file=sys.stderr)

    try:
        # 添加 User-Agent
        feed = feedparser.parse(config['url'], agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
        articles = []

        for entry in feed.entries[:limit]:
            content = ""
            if 'content' in entry:
                content = entry.content[0].value
            elif 'summary' in entry:
                content = entry.summary

            clean_content = clean_html(content)
            if not clean_content:
                clean_content = entry.title

            # 繁简转换 (对英文内容无影响)
            title = convert_to_simplified(entry.title)
            clean_content = convert_to_simplified(clean_content)

            # 计算优先级
            priority = calculate_priority(title, config['category'])

            published_at = datetime.now().isoformat()
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                published_at = datetime(*entry.published_parsed[:6]).isoformat()

            articles.append({
                'title': title,
                'summary': clean_content[:200] + '...',
                'content': f"# {title}\n\n> 来源: {config['name']} | {published_at[:10]}\n\n{clean_content}\n\n[查看原文]({entry.link})",
                'source': config['source_id'],
                'source_url': entry.link,
                'author': config['name'],
                'category': config['category'],
                'priority': priority,
                'published_at': published_at,
                'fetched_at': datetime.now().isoformat(),
                'tags': [config['name'], config['category']],
            })

        print(f"✅ {config['name']}: 获取 {len(articles)} 条", file=sys.stderr)
        return articles
    except Exception as e:
        print(f"❌ {config['name']} 抓取失败: {e}", file=sys.stderr)
        return []

def process_with_ai(articles: List[Dict], api_key: str):
    """使用 AI 生成摘要"""
    try:
        from ai_summarizer import generate_summary

        print(f"\n🤖 开始 AI 摘要生成 (共 {len(articles)} 条)...", file=sys.stderr)

        count = 0
        for i, article in enumerate(articles):
            if len(article['content']) < 100: continue
            if count > 0: time.sleep(1.5)

            # 不再强制翻译，统一使用 news 类型生成摘要
            print(f"[{i+1}/{len(articles)}] 生成摘要: {article['title'][:20]}...", file=sys.stderr)

            ai_summary = generate_summary(article['content'], 'news', api_key)

            if ai_summary:
                article['ai_summary'] = ai_summary
                count += 1
            else:
                print(f"  ⚠️ 生成失败", file=sys.stderr)

    except ImportError:
        print("❌ 未找到 ai_summarizer 模块，跳过 AI 摘要", file=sys.stderr)
    except Exception as e:
        print(f"❌ AI 处理出错: {e}", file=sys.stderr)

def save_to_supabase(articles: List[Dict], url: str, key: str):
    """上传数据到 Supabase"""
    if not create_client:
        print("❌ 未安装 supabase 库", file=sys.stderr)
        return

    print(f"\n💾 连接 Supabase...", file=sys.stderr)
    try:
        supabase: Client = create_client(url, key)
        success = 0
        skipped = 0

        for article in articles:
            try:
                # 检查重复
                existing = supabase.table('news').select('id').eq('source_url', article['source_url']).execute()
                if existing.data:
                    skipped += 1
                    continue

                supabase.table('news').insert(article).execute()
                success += 1
                print(f"  ✅ 上传: {article['title'][:20]}... [{article['priority']}]", file=sys.stderr)
            except Exception as e:
                print(f"  ❌ 上传失败: {e}", file=sys.stderr)

        print(f"📊 完成: 新增 {success}, 跳过 {skipped}", file=sys.stderr)

    except Exception as e:
        print(f"❌ Supabase 连接失败: {e}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description='多源新闻聚合爬虫')
    parser.add_argument('--upload', action='store_true', help='上传到 Supabase')
    parser.add_argument('--ai', action='store_true', help='启用 AI 摘要')
    parser.add_argument('--limit', type=int, default=10, help='每个源的限制数量')
    parser.add_argument('--supabase-url', default=os.environ.get('SUPABASE_URL'), help='Supabase URL')
    parser.add_argument('--supabase-key', default=os.environ.get('SUPABASE_KEY'), help='Supabase Key')

    args = parser.parse_args()
    api_key = os.environ.get('SILICONFLOW_API_KEY')

    all_news = []

    # 抓取各高质量源
    all_news.extend(fetch_rss_news('bbc_chinese', limit=args.limit))
    all_news.extend(fetch_rss_news('nytimes_chinese', limit=args.limit))

    print(f"\n📦 共抓取到 {len(all_news)} 条新闻", file=sys.stderr)

    # AI 处理
    if args.ai and api_key:
        process_with_ai(all_news, api_key)

    # 上传
    if args.upload:
        if args.supabase_url and args.supabase_key:
            save_to_supabase(all_news, args.supabase_url, args.supabase_key)
        else:
            print("❌ 缺少 Supabase 配置，无法上传", file=sys.stderr)
    else:
        # 本地测试
        print(json.dumps(all_news[:2], indent=2, ensure_ascii=False))

if __name__ == '__main__':
    main()
