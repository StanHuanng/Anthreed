#!/usr/bin/env python3
"""
硅基流动 AI 摘要生成器
为教务通知和 GitHub 项目生成智能摘要
"""

import requests
import json
import os
import sys
from typing import Optional, Dict

# 硅基流动 API 配置
SILICONFLOW_API_BASE = "https://api.siliconflow.cn/v1"
SILICONFLOW_MODEL = "Qwen/Qwen2.5-7B-Instruct"  # 或使用 deepseek-ai/DeepSeek-V2.5


def generate_summary(content: str, content_type: str = "notice", api_key: Optional[str] = None) -> Optional[str]:
    """
    调用硅基流动 API 生成智能摘要

    Args:
        content: 原始内容（Markdown 或文本）
        content_type: 内容类型 ('notice' 或 'github')
        api_key: 硅基流动 API Key（可从环境变量获取）

    Returns:
        生成的智能摘要（Markdown 格式）
    """
    # 获取 API Key
    if not api_key:
        api_key = os.environ.get('SILICONFLOW_API_KEY')

    if not api_key:
        print("错误: 未找到硅基流动 API Key", file=sys.stderr)
        print("请设置环境变量 SILICONFLOW_API_KEY 或通过参数传入", file=sys.stderr)
        return None

    # 构造不同类型的提示词
    if content_type == "notice":
        system_prompt = """你是一位专业的教务通知分析助手。请对以下教务通知进行深度解读，提取关键信息。

输出格式要求（严格遵守 Markdown 格式）：

## 🎯 核心要点
- 一句话概括通知主题

## 📅 重要时间节点
- 列出所有时间信息（开始时间、截止时间等）

## ⚠️ 注意事项
- 提取 3-5 条关键注意事项

## 🎓 适用对象
- 说明哪些学生/教师需要关注

请直接输出 Markdown 格式，不要添加其他说明。"""

    elif content_type == "github":
        system_prompt = """你是一位资深技术分析师。请根据提供的 GitHub 项目信息，生成一份**具体且有深度**的技术解读。

⚠️ 重要要求：
1. **禁止泛泛而谈** - 必须基于项目的实际功能、技术栈、代码特点进行分析
2. **具体化** - 提到的每个技术点都要说明"是什么"和"为什么重要"
3. **数据驱动** - 结合 Stars、Forks 等数据分析项目热度原因

输出格式（Markdown）：

## 🎯 这个项目是什么
用 2-3 句话**具体**说明项目功能，不要用"学习"、"提升"等空洞词汇。

## 🔧 核心技术/功能
列出 3-4 个**具体的**技术特性或功能模块，每条都要说明其作用。

## 🔥 为什么火
分析这个项目为什么能获得这么多 Stars，有什么独特价值。

## 👨‍💻 适合谁用
具体说明目标用户群体和使用场景。

请直接输出 Markdown，内容要具体、有深度，避免空泛描述。"""

    elif content_type == "news":
        system_prompt = """你是一位资深的国际新闻分析师，擅长从纷繁复杂的信息中提炼核心价值。请对以下新闻进行**深度解读**，而非简单复述。

⚠️ 重要原则：
1. **提炼洞察** - 不要只是概括事实，要说明"为什么重要"、"影响是什么"
2. **数据支撑** - 如有关键数字、时间节点，必须提及
3. **多维度思考** - 从政治、经济、社会等角度分析影响
4. **避免空话** - 禁止使用"引发关注"、"值得关注"等无意义表述

输出格式（Markdown）：

## 🎯 一句话核心
用一句话说明这条新闻的本质和最大影响。

## 📊 关键事实
- **事件**: 发生了什么（时间、地点、人物）
- **数据**: 列出 2-3 个关键数字或对比数据
- **立场**: 各方观点或态度（如有）

## 🌍 深层影响
从以下至少 2 个维度分析：
- 政治影响 / 经济影响 / 社会影响 / 技术趋势
- 具体说明"对谁有影响"、"短期/长期后果是什么"

## 💭 值得思考
提出 1-2 个引人深思的问题或观察角度。

请用简洁、专业的语言输出，每个部分控制在 2-3 行内。"""

    elif content_type == "news_en":
        system_prompt = """你是一位精通中英文的资深新闻编译。请阅读以下英文内容，并用**简体中文**撰写深度摘要。

输出格式（Markdown）：
## 🇨🇳 中文摘要
- 用流畅的中文概括核心事件，确保信达雅。

## 🔍 关键事实
- 列出 3-4 个关键信息点（中文）。

## 📝 原文摘录
- 摘录一句原文中最核心的句子。
- *翻译*：附上中文翻译。"""

    else:
        # 默认回退
        system_prompt = "请总结以下内容："

    # 构造 API 请求
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }

    payload = {
        'model': SILICONFLOW_MODEL,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': f"请分析以下内容：\n\n{content[:3000]}"}  # 限制长度避免超限
        ],
        'temperature': 0.7,
        'max_tokens': 1024,
        'stream': False
    }

    try:
        print(f"正在调用硅基流动 API 生成摘要（类型: {content_type}）...", file=sys.stderr)

        response = requests.post(
            f"{SILICONFLOW_API_BASE}/chat/completions",
            headers=headers,
            json=payload,
            timeout=30
        )
        response.raise_for_status()

        data = response.json()

        if 'choices' in data and len(data['choices']) > 0:
            summary = data['choices'][0]['message']['content'].strip()
            print(f"✅ AI 摘要生成成功（{len(summary)} 字符）", file=sys.stderr)
            return summary
        else:
            print(f"⚠️ API 响应格式异常: {data}", file=sys.stderr)
            return None

    except requests.exceptions.RequestException as e:
        print(f"❌ API 请求失败: {e}", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失败: {e}", file=sys.stderr)
        return None


def batch_generate_summaries(articles: list, content_type: str = "notice", api_key: Optional[str] = None) -> list:
    """
    批量生成摘要

    Args:
        articles: 文章列表（每篇文章包含 'content' 字段）
        content_type: 内容类型
        api_key: API Key

    Returns:
        添加了 ai_summary 字段的文章列表
    """
    import time
    import random

    print(f"\n开始批量生成 AI 摘要（共 {len(articles)} 篇）...", file=sys.stderr)

    for i, article in enumerate(articles, 1):
        print(f"[{i}/{len(articles)}] 处理: {article.get('title', 'Untitled')[:30]}...", file=sys.stderr)

        # 生成摘要
        summary = generate_summary(
            content=article.get('content', ''),
            content_type=content_type,
            api_key=api_key
        )

        # 添加到文章数据
        if summary:
            article['ai_summary'] = summary
        else:
            article['ai_summary'] = "**AI 摘要生成失败**"

        # 礼貌延迟（避免 API 限流）
        if i < len(articles):
            time.sleep(random.uniform(1, 2))

    print(f"\n✅ 批量处理完成！", file=sys.stderr)
    return articles


def test_api_connection(api_key: Optional[str] = None) -> bool:
    """
    测试硅基流动 API 连接

    Args:
        api_key: API Key

    Returns:
        连接是否成功
    """
    test_content = "这是一条测试通知，用于验证 API 连接。"

    summary = generate_summary(
        content=test_content,
        content_type="notice",
        api_key=api_key
    )

    return summary is not None


# ==================== 主函数（用于测试） ====================

def main():
    """主函数 - 测试 AI 摘要功能"""
    import argparse

    parser = argparse.ArgumentParser(description='硅基流动 AI 摘要生成器')
    parser.add_argument('--test', action='store_true', help='测试 API 连接')
    parser.add_argument('--api-key', default='', help='硅基流动 API Key')
    parser.add_argument('--content', default='', help='待分析的内容')
    parser.add_argument('--type', default='notice', choices=['notice', 'github'], help='内容类型')

    args = parser.parse_args()

    # 获取 API Key
    api_key = args.api_key or os.environ.get('SILICONFLOW_API_KEY')

    if not api_key:
        print("❌ 错误: 未提供 API Key", file=sys.stderr)
        print("\n使用方法:", file=sys.stderr)
        print("  方式 1: python ai_summarizer.py --api-key YOUR_API_KEY --test", file=sys.stderr)
        print("  方式 2: 设置环境变量 SILICONFLOW_API_KEY", file=sys.stderr)
        sys.exit(1)

    # 测试连接
    if args.test:
        print("🔍 测试硅基流动 API 连接...\n", file=sys.stderr)
        success = test_api_connection(api_key)

        if success:
            print("\n✅ API 连接测试成功！", file=sys.stderr)
            sys.exit(0)
        else:
            print("\n❌ API 连接测试失败！", file=sys.stderr)
            sys.exit(1)

    # 生成摘要
    if args.content:
        summary = generate_summary(
            content=args.content,
            content_type=args.type,
            api_key=api_key
        )

        if summary:
            print("\n" + "="*60)
            print("生成的 AI 摘要:")
            print("="*60)
            print(summary)
        else:
            print("\n❌ 摘要生成失败", file=sys.stderr)
            sys.exit(1)
    else:
        print("❌ 请提供 --content 参数或使用 --test 测试连接", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
