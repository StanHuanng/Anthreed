# Anthreed · React 演示

新版应用在 `web/`。旧 Flutter 应用保持独立，新版不读取它的配置或密钥。

本机地址：<http://127.0.0.1:48740>

## 启动

```bash
cd /workspace/Anthreed/web
npm install
npm run dev
```

需要 Node.js 20.19+。默认绑定 `0.0.0.0:48740`；端口占用时可运行 `npm run dev -- --port 48741`。
已有 `data/articles.json` 可直接启动，无需数据库。`npm run build` 会把这份数据一起打包。

## 更新订阅

```bash
cd /workspace/Anthreed
python3 -m venv .venv
.venv/bin/pip install -r fetchers/requirements.txt
source .venv/bin/activate
python -m fetchers.run
```

DeepSeek 从环境变量或根目录 `.env` 读取 `DEEPSEEK_API_KEY`，不会将密钥发送到浏览器。`.env` 已忽略；新环境可复制 `.env.example` 后自行填值。脚本不导入旧代码或旧密钥。

流程：并发抓取三个来源 → 统一文章格式 → DeepSeek 按事件聚类、选一篇 → 补全正文 → 写入 `data/articles.json` → 服务端同步 Supabase。`data/clusters.json` 保存选择记录；`data/fetch-cache.json` 保存来源缓存与 ETag。服务运行时点界面的重新读取按钮即可加载订阅，不会在浏览器发起 Python 抓取。云端失败保留本地文件，下一次运行可重试。

- AIHOT：公开 `/api/v1/items`；保留原作者、原文链接、来源摘要，支持 ETag。
- 归藏：网页公开的深度文章。当前抓到的文章日期为 2026 年 3 月，按原始日期显示；快讯没有静态原文链接，未猜测链接。
- 乔木：先尝试 `/feed`、`/rss.xml`、`/atom.xml`，发现这些返回 HTML 后，从首页 RSS 入口自动找到 `/feed.xml`。
- 单来源失败保留该来源上次成功缓存。总内容不足时补充 `is_fixture=true` 的明确标注示例。
- 模型不可用时优先保留上次经过 DeepSeek 选稿的文章，UI 明示暂未更新；初次运行没有历史选稿时才使用 `local_fallback` 并明确标注。此次交付已真实调用 DeepSeek，结果为 `deepseek`。
- `flock` 防止并发抓取；JSON 使用原子替换。普通定时任务可调用同一个 CLI，Grok Bot 只负责运行环境和抓取，不进入产品界面。

## EPUB、摘录与阅读

三个入口：订阅 / 书架 / 摘录。支持来源筛选、收藏与正文内联阅读。正文缺失时显示「正文尚未同步」，来源摘要单独标注。

书架通过系统文件选择器导入 EPUB，原文件、元数据、文字章节、章节位置和进度保存在 IndexedDB。相同文件使用 SHA-256 标识，不会重复导入。可先试读内置的原创示例书《阅读的间隙》；生成脚本为 `scripts/create_demo_epub.py`。

演示版提供常规 EPUB 的文字阅读，目录、字号、浅深色切换与章节续读可用。图片、脚注、复杂版式和精确 CFI 定位尚未实现；文件大小上限 40 MB。导入内容转换为 React 文本块，不执行 EPUB 脚本。EPUB 不上传云端。

文章与 EPUB 可保存选中文字；摘录可导出 Markdown。仅品牌名 Anthreed 使用 Playfair Display Italic；正文与标题使用 Newsreader + Noto Serif SC；操作控件使用系统无衬线字体。CDS 原始主题文件复制到 `web/src/cds-theme.css`，应用样式使用语义令牌。

PWA 目前提供 manifest 与图标。已有会话可离线读取缓存文章和本机书籍；完整离线启动的 Service Worker 尚未实现。

## Supabase 接入

1. 在目标项目执行 `supabase/schema_apply.sql`。可在 SQL Editor 执行，或在根目录运行 `node --env-file=.env scripts/apply_supabase_schema.mjs`：优先使用 `.env` 的 `SUPABASE_ACCESS_TOKEN`，其次使用 DISPLAY=:3 Chrome 的已授权 dashboard 会话。服务密钥不能执行建表 SQL；必须有目标项目的管理权限。
2. 在根目录 `.env` 设置 `DATA_PROVIDER=supabase`、`SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`，然后重启 Vite。不要把密钥写进源码或提交到 Git。
3. 在根目录运行 `python3 -m fetchers.supabase_sync` 迁移当前 JSON。以后 `python3 -m fetchers.run` 每次写完 JSON 都会自动同步，包括模型失败时保留的精选文章。

`web/src/lib/data.ts` 使用 anon key 分页读取 `feed_articles`；视图缺失时尝试 `articles`，按事件与 URL 去重。正文映射到 `content`，兼容 `body` 与 `event_cluster_id`。云端不可用或未迁移时回退本地 JSON，再尝试设备缓存，并在订阅与数据状态中说明失败。RLS 不允许匿名写入。

服务端按依赖顺序分批 upsert `sources`、`clusters`、`articles`，通过 ID 和已有 URL 解析文章身份，重试不会重复插入；缺失的新正文不会覆盖已有云端正文。不同表的请求不是单个事务，中途失败可重跑。`SUPABASE_SERVICE_ROLE_KEY` 仅用于 Python，Vite 仅暴露 URL 与 anon key。

## 验证

```bash
cd /workspace/Anthreed
.venv/bin/python -m unittest fetchers.test_pipeline fetchers.test_body fetchers.test_supabase_sync
node --env-file=.env web/scripts/qa-supabase.mjs
cd web
npm run typecheck
npm run check:tokens
npm run build
# 保持 dev server 运行，使用本机 Chrome 截图并检查完整用户流程
npm run qa
```

界面截图与检查结果位于 `qa/ui-polish/`，云端接入报告与匿名读取检查位于 `qa/supabase-wire/`。浏览器脚本默认使用 `/usr/bin/google-chrome`，可通过 `CHROME_BIN` 调整。
