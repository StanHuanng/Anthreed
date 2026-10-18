# Anthreed 项目指南

> 本文档供 Claude AI 助手使用，记录项目架构、开发规范和用户偏好。

## 项目概述

**Anthreed** 是一款面向工程背景用户的自动化信息聚合 App，专注于 GitHub Trending 技术项目和华工教务通知的智能收集与展示。

### 核心特性
- **双主题系统**：羊皮纸模式 (Parchment) + 极夜模式 (Pitch Black)
- **全自动化数据流**：GitHub Actions + Python 爬虫 + Supabase 云端存储
- **AI 智能摘要**：集成硅基流动 API，为内容生成深度解读
- **跨平台 Flutter App**：支持 Android、iOS、Web、Desktop

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Flutter 3.0+ (Dart) |
| 状态管理 | Provider |
| 数据库 | Supabase (PostgreSQL) |
| 自动化 | GitHub Actions |
| 爬虫 | Python (requests, BeautifulSoup, html2text) |
| AI 服务 | 硅基流动 API (Qwen2.5-7B-Instruct) |
| UI 组件 | google_fonts, flutter_markdown, cached_network_image |

## 项目结构

```
Anthreed/
├── app/                              # Flutter 应用
│   ├── lib/
│   │   ├── main.dart                 # 应用入口
│   │   ├── config/
│   │   │   ├── app_config.dart       # 应用配置
│   │   │   └── supabase_config.dart  # Supabase 连接配置
│   │   ├── core/
│   │   │   ├── models/
│   │   │   │   └── article.dart      # 文章数据模型
│   │   │   ├── theme/
│   │   │   │   ├── theme_provider.dart    # 主题状态管理
│   │   │   │   ├── parchment_theme.dart   # 羊皮纸主题
│   │   │   │   └── pitch_black_theme.dart # 极夜主题
│   │   │   └── utils/
│   │   │       └── date_formatter.dart
│   │   ├── features/
│   │   │   ├── feed/                 # 信息流模块
│   │   │   │   ├── data/
│   │   │   │   │   ├── datasources/mock_datasource.dart
│   │   │   │   │   └── repositories/article_repository.dart
│   │   │   │   └── presentation/
│   │   │   │       ├── pages/feed_page.dart
│   │   │   │       └── widgets/article_card.dart
│   │   │   ├── reader/               # Markdown 阅读器
│   │   │   │   └── presentation/
│   │   │   │       ├── pages/reader_page.dart
│   │   │   │       └── widgets/markdown_renderer.dart
│   │   │   └── archive/              # 归档模块 (占位)
│   │   └── shared/widgets/
│   │       ├── theme_toggle_button.dart
│   │       └── parchment_background.dart
│   ├── assets/
│   │   ├── textures/parchment_noise.jpg  # 羊皮纸纹理
│   │   └── icons/github_icon.svg
│   └── pubspec.yaml
├── scripts/                          # Python 自动化脚本
│   ├── fetch_github_trending.py      # GitHub Trending 爬虫
│   ├── fetch_scut_jw.py              # 华工教务通知爬虫
│   └── ai_summarizer.py              # 硅基流动 AI 摘要生成
├── .github/workflows/
│   └── daily_update.yml              # 每日定时任务 (UTC 18:00 = 北京 02:00)
└── claude.md                         # 本文档
```

## 数据流架构

```
GitHub Trending API ──┐
                      ├──> Python 爬虫 ──> 硅基流动 AI ──> Supabase DB
华工教务网站 ─────────┘                     (智能摘要)        │
                                                              ↓
                                                       Flutter App
                                                     (ArticleRepository)
```

## 核心模块说明

### 1. Article 数据模型
```dart
class Article {
  final String id;
  final String title;
  final String? summary;      // 列表摘要
  final String content;       // Markdown 正文
  final String source;        // 'github_trending' | 'SCUT_JW'
  final String? sourceUrl;
  final String? author;
  final DateTime? publishedAt;
  final DateTime fetchedAt;
  final List<String> tags;
  final bool isFavorited;
  final String? aiSummary;    // AI 生成的智能摘要
}
```

### 2. 主题系统
- **ThemeProvider**: 基于 `ChangeNotifier` 的状态管理
- **持久化**: 使用 `SharedPreferences` 保存用户偏好
- **羊皮纸模式**: 米黄底色 `#F5F0E6`，Frank Ruhl Libre 衬线字体
- **极夜模式**: 深黑底色 `#0A0A0A`，高对比度，OLED 优化

### 3. ArticleRepository
- 优先从 Supabase 获取数据
- 支持 Mock 数据降级（开发/离线模式）
- 合并 `articles` 和 `school_notices` 两张表

### 4. GitHub Trending 爬虫智能筛选
- **黑名单过滤**: 排除 awesome/tutorial/interview 等收集类项目
- **优先级加权**: AI/LLM/工具类项目优先展示
- **时效性**: 只抓取最近 30 天创建、100+ Stars 的新项目

### 5. AI 摘要生成
- **API**: 硅基流动 (api.siliconflow.cn)
- **模型**: Qwen/Qwen2.5-7B-Instruct
- **格式**: 针对 GitHub 项目和教务通知有不同的提示词模板

## Supabase 配置

**数据库表结构:**
- `articles`: GitHub Trending 文章
- `school_notices`: 华工教务通知

**待执行数据库变更 (Required DB Changes):**

请在 Supabase SQL Editor 中运行以下 SQL 以支持新功能：

```sql
-- 1. 创建新闻表 (New)
CREATE TABLE IF NOT EXISTS news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    source TEXT NOT NULL,  -- 'news_domestic', 'news_international', 'news_tech'
    source_url TEXT,
    author TEXT,
    category TEXT,         -- 'domestic', 'international', 'tech'
    published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    tags TEXT[] DEFAULT '{}',
    ai_summary TEXT,
    is_favorited BOOLEAN DEFAULT FALSE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_news_category ON news(category);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_title_source ON news(title, source);

-- 2. 更新教务通知表 (Add Priority)
ALTER TABLE school_notices ADD COLUMN IF NOT EXISTS priority TEXT; -- 'high' | 'low'
```

**Secrets (GitHub Actions):**
- `SUPABASE_URL`
- `SUPABASE_KEY` (Service Role Key)
- `SILICONFLOW_API_KEY`

## 开发命令

```bash
# Flutter 应用
cd app
flutter pub get          # 安装依赖
flutter run               # 运行调试
flutter build apk --release  # 打包 APK

# Python 爬虫
cd scripts
pip install requests supabase beautifulsoup4 html2text

# 抓取 GitHub Trending (带 AI 摘要)
python fetch_github_trending.py --limit 10 --ai --upload

# 抓取教务通知
python fetch_scut_jw.py --pages 2 --limit 10 --upload

# 测试 AI 摘要
python ai_summarizer.py --api-key YOUR_KEY --test
```

## 用户偏好记录

> 以下是与用户交流中确认的开发偏好，请在后续开发中遵循：

### 代码风格
- 使用中文注释和日志输出
- Python 脚本输出信息到 stderr，JSON 数据到 stdout
- Flutter 代码遵循 Clean Architecture 分层

### 设计偏好
- 界面风格参考 Claude AI 官网的羊皮纸质感
- 双主题必须同时维护，不能只实现一种
- 避免千篇一律的 Material Design 默认样式

### 功能优先级
1. GitHub Trending 聚合（已完成）
2. AI 智能摘要（已完成）
3. 教务通知爬虫（已完成，需校园网环境）
4. 收藏/归档功能（待开发）

### 注意事项
- 教务通知爬虫需要 SSO 认证，GitHub Actions 无法自动运行
- Supabase Anon Key 用于客户端读取，Service Role Key 用于服务端写入
- 爬虫需礼貌延迟（1-3秒），避免被封禁

---

*最后更新: 2025-01-20*
*由 Claude AI 自动生成，用于项目记忆持久化*
