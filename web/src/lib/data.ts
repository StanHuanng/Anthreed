export const sourceNames: Record<string, string> = { guizang: '归藏', qiaomu: '乔木', aihot: 'AIHOT' }
export type Coverage = { id: string; source: string; title: string; url: string; author?: string }
export type Article = {
  id: string; source: string; title: string; summary: string; url: string
  published_at: string | null; content?: string | null; body?: string | null; author?: string
  cluster_id: string; selection_reason: string; also_covered_by: Coverage[]; is_fixture: boolean
}
export type SourceStatus = { id: string; name: string; url: string; status: string; count: number; method?: string; note?: string; last_success?: string }
export type Feed = {
  generated_at: string; selection_mode: string; input_count: number; cluster_count: number
  sources: SourceStatus[]; articles: Article[]; from_cache?: boolean; selection_stale?: boolean
  data_origin?: 'supabase' | 'local' | 'cache'; data_warning?: string
}
declare const __PUBLIC_DATA_CONFIG__: { provider: string; url: string; anonKey: string }
const config = __PUBLIC_DATA_CONFIG__
const CACHE_KEY = 'anthreed-feed-v1'

export function articleContent(article: Article): string {
  return article.content?.trim() || article.body?.trim() || ''
}

export function safeUrl(value: string): string {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '#' } catch { return '#' }
}

export function dateLabel(value: string | null, withYear = false) {
  if (!value) return '日期未提供'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '日期未提供' : new Intl.DateTimeFormat('zh-CN', { year: withYear ? 'numeric' : undefined, month: 'numeric', day: 'numeric' }).format(date)
}

export function uniqueEvents(articles: Article[]) {
  const clusters = new Set<string>(), urls = new Set<string>()
  return articles.filter(article => {
    if (!article.id || !article.cluster_id || clusters.has(article.cluster_id) || urls.has(article.url)) return false
    clusters.add(article.cluster_id); urls.add(article.url)
    return true
  })
}

type CloudArticle = Partial<Article> & { event_cluster_id?: string; fetched_at?: string }
class CloudError extends Error {
  constructor(public status: number) { super(`云端订阅读取失败（HTTP ${status}）。`) }
}

function mapArticle(row: CloudArticle): Article {
  const cluster = row.cluster_id || row.event_cluster_id
  if (!row.id || !cluster || !row.source || !row.title || !row.url) throw new Error('订阅文章字段不完整。')
  return { id: row.id, cluster_id: cluster, source: row.source, title: row.title,
    url: row.url, summary: row.summary || '', content: row.content?.trim() || row.body?.trim() || null,
    author: row.author || undefined, published_at: row.published_at || null,
    selection_reason: row.selection_reason || '',
    also_covered_by: Array.isArray(row.also_covered_by) ? row.also_covered_by : [], is_fixture: !!row.is_fixture }
}

function normalizeFeed(feed: Feed): Feed {
  if (!Array.isArray(feed.articles) || !Array.isArray(feed.sources)) throw new Error('订阅数据格式不正确。')
  return { ...feed, articles: uniqueEvents(feed.articles.map(mapArticle)) }
}

async function localFeed(): Promise<Feed> {
  const response = await fetch('/data/articles.json', { cache: 'no-cache', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('本地订阅数据暂不可用。')
  return { ...normalizeFeed(await response.json()), data_origin: 'local' }
}

// Only the public URL and anon key are compiled by Vite. The service key stays in Python.
async function cloudRows<T>(table: string, order = 'id.asc'): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const query = new URLSearchParams({ select: '*', order, limit: '1000', offset: String(offset) })
    const response = await fetch(`${config.url.replace(/\/$/, '')}/rest/v1/${table}?${query}`, {
      headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` }, signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new CloudError(response.status)
    const page: T[] = await response.json()
    if (!Array.isArray(page)) throw new Error('云端订阅数据格式不正确。')
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

async function cloudFeed(): Promise<Feed> {
  if (!config.url || !config.anonKey) throw new Error('云端订阅尚未配置。')
  let rows: CloudArticle[]
  try { rows = await cloudRows<CloudArticle>('feed_articles', 'published_at.desc.nullslast,id.asc') }
  catch (error) {
    if (!(error instanceof CloudError) || error.status !== 404) throw error
    rows = await cloudRows<CloudArticle>('articles', 'published_at.desc.nullslast,id.asc')
  }
  if (!rows.length) throw new Error('云端订阅尚无文章。')
  const articles = uniqueEvents(rows.map(mapArticle))
  const [sources, clusters] = await Promise.all([
    cloudRows<{ id: string; name: string; url: string; status: string; last_success_at?: string }>('sources').catch(() => []),
    cloudRows<{ id: string; selection_mode: string }>('clusters').catch(() => []),
  ])
  const activeClusters = clusters.filter(c => articles.some(a => a.cluster_id === c.id))
  const dates = rows.map(a => a.fetched_at).filter((date): date is string => !!date).sort()
  return { generated_at: dates.at(-1) || new Date().toISOString(),
    selection_mode: activeClusters.length && activeClusters.every(c => c.selection_mode === 'deepseek') ? 'deepseek'
      : activeClusters.some(c => c.selection_mode === 'local_fallback') ? 'local_fallback' : 'unknown',
    input_count: articles.reduce((count, a) => count + 1 + a.also_covered_by.length, 0), cluster_count: articles.length,
    sources: sources.map(s => ({ id: s.id, name: s.name, url: s.url, status: s.status,
      count: articles.filter(a => a.source === s.id).length, last_success: s.last_success_at, method: '云端同步' })),
    articles, data_origin: 'supabase' }
}

function cacheFeed(feed: Feed): Feed {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(feed)) } catch { /* Cache is optional. */ }
  return feed
}

export async function loadFeed(): Promise<Feed> {
  let cloudWarning = ''
  if (config.provider === 'supabase') {
    try { return cacheFeed(await cloudFeed()) }
    catch (error) { cloudWarning = error instanceof CloudError ? error.message : error instanceof Error && !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name) ? error.message : '云端订阅暂时无法连接。' }
  }
  try {
    return cacheFeed({ ...await localFeed(), data_warning: cloudWarning ? `${cloudWarning}正在显示本地订阅。` : undefined })
  } catch {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) return { ...normalizeFeed(JSON.parse(cached)), from_cache: true, data_origin: 'cache',
        data_warning: `${cloudWarning}本地订阅暂不可用，正在显示离线缓存。` }
    } catch { /* Present a clear, sanitized load error. */ }
    throw new Error(`${cloudWarning}本地订阅与离线缓存均不可用，请稍后重试。`)
  }
}
