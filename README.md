# Anthreed

阅读器+订阅源

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

