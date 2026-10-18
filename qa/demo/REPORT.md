DEMO_URL=http://127.0.0.1:48740
DEMO_DIR=/workspace/Anthropo-Reader/web
HOW_TO_RUN=cd /workspace/Anthropo-Reader/web && npm install && npm run dev
SUPABASE_STATUS=waiting_for_aether
CONFIRM=服务已启动并保留运行；三标签可用；首页每事件一张入选卡；EPUB 文件可导入、持久化和续读；四张指定截图齐全；未复用旧 Supabase 密钥；无 Grok 聊天界面；阅读字体 Frank Ruhl Libre；新密钥未写入前端或提交。
NOTES=三来源真实抓取成功，DeepSeek 将 40 篇归并为 35 个事件；当前数据没有示例资讯。Supabase 等待 Aether 新项目。EPUB 为本机文字阅读预览，PWA 先提供 manifest。

## 运行与数据

- 本地服务：`127.0.0.1:48740`，后台 PID 记录在 `vite.pid`，运行日志 `vite.log`。
- 新应用根目录：`web/`，React + TypeScript + Vite；既有 Flutter 独立保留。
- 抓取命令：仓库根目录执行 `source .venv/bin/activate && python -m fetchers.run`。
- 来源：归藏 2 篇公开深度文章；乔木 14 篇 RSS；AIHOT 24 篇公开 API。
- 乔木 RSS 自动发现为 `https://blog.qiaomu.ai/feed.xml`。常见候选路径实际返回 HTML，已检测并排除。
- 归藏当前公开深度文章日期为 2026 年 3 月，UI 保留原始日期，不当作今日资讯。
- DeepSeek 实际调用成功；模型输出经过 id 完整性与唯一性校验。同一模型版本的发布和第三方适配合并；重复评测、Reflection Beam 的适配报道也已折叠。
- `data/articles.json` 仅包含入选文章；`data/clusters.json` 保存每组输入 id、winner_id、原因；`fetch.log` 有无密钥的选稿日志。
- 模型后续暂不可用时，优先保留上次已选文章，避免用未经选稿的新内容覆盖它们。

## 验证结果

- `npm run typecheck`：通过。
- `npm run check:tokens`：通过，应用样式仅使用 CDS 令牌。
- `npm run build`：通过，包含本地 JSON 数据。
- `.venv/bin/python -m unittest fetchers.test_pipeline -v`：9 项通过。
- `npm run qa`：27 项真实 Chrome 浏览器检查通过，未捕获浏览器异常。
- 验证了全部 / 归藏 / 乔木 / AIHOT 筛选、收藏筛选、事件 id 唯一性、原文链接、字号、EPUB 导入与重复导入、刷新后书籍及阅读进度恢复、摘录保存与 Markdown 导出、深色模式、离线缓存。
- 视口：390 × 844，额外检查 320px 和 1280px，无横向溢出。
- 本机 `.env` 已忽略且权限为 600；新前端、构建产物、抓取数据和 QA 文件的 DeepSeek 密钥扫描通过。Supabase 服务端密钥未暴露到浏览器配置。

## 截图

- [01-subscribe.png](01-subscribe.png)
- [02-article.png](02-article.png)
- [03-bookshelf.png](03-bookshelf.png)
- [04-excerpts.png](04-excerpts.png)
- 附加：书架空状态、EPUB 阅读、深色模式、桌面布局截图；详细检查见 `checks.json`。

截图中的《阅读的间隙》是内置原创示例 EPUB，通过真实文件选择器导入。摘录截图中的片段通过实际保存文章摘要产生，不是静态假 UI。QA 使用独立临时浏览器，首次打开演示时书架和摘录为空，可通过“先试读一本示例书”体验。

## 预留与边界

- `supabase/schema.sql` 提供 sources、articles、clusters、只读入选视图和 RLS。`web/src/lib/data.ts` 有 `DATA_PROVIDER=supabase` 读取开关；新项目尚未执行 SQL 或连接，云端写入适配待接。
- EPUB 支持目录、章节阅读、字号和章节/滚动进度保存；图片、复杂版式、精确 CFI 定位尚未实现。
- PWA 已有 manifest 与图标，已有会话可用文章缓存；完整离线启动的 Service Worker 待后续实现。
- 本轮只运行抓取周期，未安装定时任务、未推送 Git、未对外发布。
- 详细启动与使用说明：`/workspace/Anthropo-Reader/README.demo.md`。
