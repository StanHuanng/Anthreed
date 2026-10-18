# Anthreed

订阅归藏、乔木、AIHOT，同一件事只留一篇值得读的。也能导入本地 EPUB，书和摘录都放在当前浏览器的 IndexedDB，不上云。

界面是 CDS（open-claude-ui）。品牌名 Anthreed 单独用 Playfair Display Italic，其它用 Newsreader + Noto Serif SC。

## 怎么开

```bash
cd web
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:48740。不要直接双击 `index.html`。

抓取在仓库根目录：

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r fetchers/requirements.txt
python -m fetchers.run
```

同事件去重要 `DEEPSEEK_API_KEY`。根目录 `.env` 里配 `DATA_PROVIDER=supabase` 和 Supabase 密钥后，前端匿名读云端订阅；抓取用服务密钥写。云挂了就退回本地 JSON。建表步骤见 [README.demo.md](README.demo.md#supabase-接入)。

EPUB 自己拖进去，不做换源，也不附带电子书。
