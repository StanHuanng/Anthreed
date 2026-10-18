import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  // Only these two public fields may reach the browser. Never expose the service key.
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '')
  return {
    plugins: [react(), {
      name: 'local-article-data',
      configureServer(server) {
        server.middlewares.use('/data/articles.json', async (_req, res) => {
          try {
            const data = await readFile(new URL('../data/articles.json', import.meta.url), 'utf8')
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(data)
          } catch { res.statusCode = 503; res.end('{"error":"请先运行抓取程序"}') }
        })
      },
      async generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'data/articles.json', source: await readFile(new URL('../data/articles.json', import.meta.url), 'utf8') })
      },
    }],
    define: {
      __PUBLIC_DATA_CONFIG__: JSON.stringify({
        provider: env.DATA_PROVIDER || 'local',
        url: env.SUPABASE_URL || '',
        anonKey: env.SUPABASE_ANON_KEY || '',
      }),
    },
  }
})
