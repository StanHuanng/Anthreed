#!/usr/bin/env python3
"""
GitHub Trending Data Fetching Script
Fetches trending repositories from GitHub and uploads to Supabase
集成硅基流动 AI 摘要生成功能
"""

import requests
import json
import os
import sys
import argparse
from datetime import datetime

# Try to import supabase
try:
    from supabase import create_client, Client
except ImportError:
    create_client = None

# Try to import AI summarizer
try:
    from ai_summarizer import generate_summary
except ImportError:
    generate_summary = None

def fetch_trending_repos(language='', limit=20, use_ai=False, api_key=None):
    """
    Fetch GitHub Trending repositories - 智能筛选前沿项目

    筛选策略：
    1. 只抓取最近30天创建的新项目
    2. 过滤掉 awesome/教程/面试 等收集类项目
    3. 优先展示 AI/工具/App 类项目

    Args:
        language: Programming language filter
        limit: Number of results
        use_ai: Whether to generate AI summaries
        api_key: SiliconFlow API key for AI summaries
    """
    from datetime import timedelta
    import re

    # ==================== 筛选配置 ====================

    # 黑名单：过滤收集类/教程类/资源类项目
    EXCLUDE_PATTERNS = [
        # 收集类
        r'^awesome[-_]', r'[-_]awesome$', r'[-_]list$', r'^list[-_]',
        r'resources', r'curated', r'collection',
        # 教程/学习类
        r'interview', r'learning', r'^learn[-_]', r'[-_]learn$',
        r'tutorial', r'course', r'guide', r'handbook',
        r'roadmap', r'cheatsheet', r'notes',
        # 纯素材类
        r'^icons?$', r'^fonts?$', r'wallpaper', r'design[-_]resources',
        # 其他低价值
        r'free[-_]programming', r'coding[-_]interview',
        r'system[-_]design', r'algorithm', r'leetcode',
    ]

    # 优先关键词：AI/工具/App 相关（权重 +100）
    PRIORITY_KEYWORDS = [
        # AI/LLM 前沿
        'ai', 'llm', 'gpt', 'claude', 'agent', 'mcp',
        'anthropic', 'openai', 'gemini', 'ollama', 'langchain',
        'rag', 'embedding', 'vector', 'chatbot',
        # 开发工具
        'cursor', 'copilot', 'vscode', 'neovim', 'vim',
        'terminal', 'cli', 'sdk', 'api', 'devtools',
        # 实用 App/客户端
        'app', 'desktop', 'client', 'gui', 'native',
        'macos', 'windows', 'linux', 'cross-platform',
        'tauri', 'electron', 'flutter',
        # 效率工具
        'productivity', 'automation', 'workflow', 'utility',
        'tool', 'assistant', 'helper', 'manager',
        # 新兴技术
        'rust', 'zig', 'bun', 'deno', 'wasm', 'webassembly',
    ]

    # ==================== 辅助函数 ====================

    def should_exclude(repo_name: str, description: str) -> bool:
        """检查项目是否应该被过滤"""
        text = f"{repo_name} {description}".lower()
        for pattern in EXCLUDE_PATTERNS:
            if re.search(pattern, text):
                return True
        return False

    def calculate_priority(repo: dict) -> int:
        """计算项目优先级分数"""
        name = repo.get('name', '').lower()
        desc = (repo.get('description') or '').lower()
        text = f"{name} {desc}"

        score = 0
        for keyword in PRIORITY_KEYWORDS:
            if keyword in text:
                score += 100

        # 新项目加分（创建时间越近分数越高）
        try:
            created = datetime.fromisoformat(repo['created_at'].replace('Z', '+00:00'))
            days_ago = (datetime.now(created.tzinfo) - created).days
            if days_ago <= 7:
                score += 50  # 一周内创建
            elif days_ago <= 14:
                score += 30  # 两周内创建
        except:
            pass

        return score

    # ==================== 抓取逻辑 ====================

    url = "https://api.github.com/search/repositories"

    # 查询：最近 30 天创建的项目，至少 100 Stars
    thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    query = f'created:>{thirty_days_ago} stars:>100'
    if language:
        query += f' language:{language}'

    params = {
        'q': query,
        'sort': 'stars',
        'order': 'desc',
        'per_page': min(limit * 3, 100)  # 多抓一些用于过滤
    }

    try:
        print(f"🔍 查询条件: {query}", file=sys.stderr)
        response = requests.get(url, params=params)
        response.raise_for_status()
        repos = response.json().get('items', [])

        print(f"📦 获取到 {len(repos)} 个原始项目", file=sys.stderr)

        # Step 1: 过滤黑名单项目
        filtered_repos = []
        excluded_count = 0
        for repo in repos:
            name = repo.get('name', '')
            desc = repo.get('description') or ''
            if should_exclude(name, desc):
                excluded_count += 1
                print(f"  ❌ 过滤: {name}", file=sys.stderr)
            else:
                filtered_repos.append(repo)

        print(f"🧹 过滤掉 {excluded_count} 个收集类/教程类项目", file=sys.stderr)

        # Step 2: 按优先级排序
        for repo in filtered_repos:
            repo['_priority'] = calculate_priority(repo)

        filtered_repos.sort(key=lambda x: (x['_priority'], x['stargazers_count']), reverse=True)

        # Step 3: 取前 limit 个
        final_repos = filtered_repos[:limit]

        print(f"✅ 最终选取 {len(final_repos)} 个优质项目", file=sys.stderr)

        articles = []
        for i, repo in enumerate(final_repos):
            # Build article content
            content = f"""# {repo['name']}

{repo['description'] or 'No description provided.'}

## Project Info
- **Stars**: {repo['stargazers_count']:,}
- **Language**: {repo['language'] or 'N/A'}
- **Forks**: {repo['forks_count']:,}
- **Open Issues**: {repo['open_issues_count']}
- **Created**: {repo['created_at'][:10]}
- **Last Updated**: {repo['updated_at'][:10]}

## Links
[View Project]({repo['html_url']})

## Author
[{repo['owner']['login']}]({repo['owner']['html_url']})
"""

            article = {
                'title': repo['name'],
                'summary': (repo['description'] or '')[:300],
                'content': content,
                'source': 'github_trending',
                'source_url': repo['html_url'],
                'author': repo['owner']['login'],
                'published_at': repo['created_at'],
                'fetched_at': datetime.now().isoformat(),
                'tags': [repo['language']] if repo['language'] else [],
                'is_favorited': False,
                'ai_summary': None  # Will be filled if use_ai is True
            }

            # Generate AI summary if enabled
            if use_ai and generate_summary:
                print(f"[{i+1}/{len(repos)}] 🤖 生成 AI 摘要: {repo['name'][:30]}...", file=sys.stderr)
                ai_summary = generate_summary(
                    content=content,
                    content_type='github',
                    api_key=api_key
                )
                if ai_summary:
                    article['ai_summary'] = ai_summary
                    # 用 AI 摘要替换原始 content，保留原始链接
                    article['content'] = f"""# {repo['name']}

{ai_summary}

---

## 📎 原始链接
[查看 GitHub 项目]({repo['html_url']})

## 📊 项目数据
- ⭐ Stars: {repo['stargazers_count']:,}
- 🍴 Forks: {repo['forks_count']:,}
- 💻 Language: {repo['language'] or 'N/A'}
- 👤 Author: [{repo['owner']['login']}]({repo['owner']['html_url']})
"""
                # 礼貌延迟避免 API 限流
                import time
                import random
                if i < len(repos) - 1:
                    time.sleep(random.uniform(1, 2))

            articles.append(article)

        return articles

    except requests.exceptions.RequestException as e:
        print(f"Error: Failed to fetch data - {e}", file=sys.stderr)
        return []

def save_to_supabase(articles, url, key):
    """
    Upload articles to Supabase
    """
    if not create_client:
        print("Error: 'supabase' package not installed. Run: pip install supabase", file=sys.stderr)
        return

    print(f"Connecting to Supabase...", file=sys.stderr)
    try:
        supabase: Client = create_client(url, key)

        count = 0
        for article in articles:
            try:
                # Check for duplicates based on source_url
                # Note: This requires the key to have SELECT permissions
                existing = supabase.table('articles').select('id').eq('source_url', article['source_url']).execute()

                if existing.data:
                    print(f"Skipping existing: {article['title'][:20]}...", file=sys.stderr)
                else:
                    # Insert new article
                    # Note: This requires the key to have INSERT permissions (Service Role Key recommended)
                    supabase.table('articles').insert(article).execute()
                    print(f"Uploaded: {article['title'][:20]}...", file=sys.stderr)
                    count += 1

            except Exception as e:
                print(f"Error uploading {article['title'][:20]}: {e}", file=sys.stderr)

        print(f"Upload complete. New articles: {count}", file=sys.stderr)

    except Exception as e:
        print(f"Supabase connection error: {e}", file=sys.stderr)

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Fetch GitHub Trending Data')
    parser.add_argument('--language', default='', help='Programming language filter')
    parser.add_argument('--limit', type=int, default=20, help='Number of results')
    parser.add_argument('--output', default='', help='Output file path')
    parser.add_argument('--upload', action='store_true', help='Upload to Supabase')
    parser.add_argument('--ai', action='store_true', help='Generate AI summaries using SiliconFlow')
    parser.add_argument('--ai-key', default='', help='SiliconFlow API Key (or use SILICONFLOW_API_KEY env)')

    # Args for Supabase credentials (optional, can use env vars)
    # Defaulting to provided credentials for ease of use
    default_url = os.environ.get("SUPABASE_URL", "")
    default_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY", "")

    parser.add_argument('--supabase-url', default=default_url, help='Supabase Project URL')
    parser.add_argument('--supabase-key', default=default_key, help='Supabase API Key')

    args = parser.parse_args()

    # Check AI requirements
    if args.ai:
        if not generate_summary:
            print("⚠️ AI 摘要功能不可用，请确保 ai_summarizer.py 在同一目录", file=sys.stderr)
            args.ai = False
        else:
            ai_key = args.ai_key or os.environ.get('SILICONFLOW_API_KEY')
            if not ai_key:
                print("❌ 错误: 使用 --ai 需要提供硅基流动 API Key", file=sys.stderr)
                print("   使用 --ai-key YOUR_KEY 或设置环境变量 SILICONFLOW_API_KEY", file=sys.stderr)
                sys.exit(1)
            print("🤖 AI 摘要功能已启用 (硅基流动)", file=sys.stderr)

    print(f"Fetching GitHub Trending data...", file=sys.stderr)

    # Get AI key
    ai_key = args.ai_key or os.environ.get('SILICONFLOW_API_KEY') if args.ai else None

    articles = fetch_trending_repos(
        language=args.language,
        limit=args.limit,
        use_ai=args.ai,
        api_key=ai_key
    )

    print(f"Successfully fetched {len(articles)} articles", file=sys.stderr)

    # Handle Output
    if args.output:
        try:
            output_data = json.dumps(articles, indent=2, ensure_ascii=False)
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(output_data)
            print(f"Saved to: {args.output}", file=sys.stderr)
        except IOError as e:
             print(f"Error saving file: {e}", file=sys.stderr)
    elif not args.upload:
        print(json.dumps(articles, indent=2, ensure_ascii=False))

    # Handle Upload
    if args.upload:
        # Prioritize args, then env vars
        url = args.supabase_url or os.environ.get('SUPABASE_URL')
        key = args.supabase_key or os.environ.get('SUPABASE_KEY') # Prefer SERVICE_ROLE_KEY for writing

        if url and key:
            save_to_supabase(articles, url, key)
        else:
            print("Error: Supabase URL and Key required for upload.", file=sys.stderr)
            print("Provide via arguments --supabase-url/--supabase-key or environment variables.", file=sys.stderr)

if __name__ == '__main__':
    main()
