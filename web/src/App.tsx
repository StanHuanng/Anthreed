import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Bookmark, Check, ChevronDown, ChevronRight, CircleHelp, FileText, Highlighter, Library, List, LoaderCircle, Moon, Plus, Quote, RefreshCw, Rss, Search, Sun, Trash2, Type, Upload, X } from 'lucide-react'
import { articleContent, dateLabel, loadFeed, safeUrl, sourceNames, type Article, type Feed } from './lib/data'
import { importEpub, storage, type Book, type Excerpt } from './lib/storage'
import { SwipeDeck } from './components/SwipeDeck'
import { NovelReader } from './components/NovelReader'

type Tab = 'subscriptions' | 'bookshelf' | 'excerpts'
const labels: Record<Tab, string> = { subscriptions: '订阅', bookshelf: '书架', excerpts: '摘录' }
const icons = { subscriptions: Rss, bookshelf: Library, excerpts: Highlighter }
function usePreference<T,>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Preferences are optional. */ } }, [key, value])
  return [value, setValue] as const
}
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || 'subscriptions')
  useEffect(() => { const update = () => { setRoute(location.hash.slice(1) || 'subscriptions'); window.scrollTo(0, 0) }; addEventListener('hashchange', update); return () => removeEventListener('hashchange', update) }, [])
  return [route, (next: string) => { location.hash = next }] as const
}
function IconButton({ children, label, onClick, active = false, disabled = false }: { children: ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return <button className={`icon-button ${active ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}>{children}</button>
}
function SourceMark({ source }: { source: string }) { return <span className={`source-mark ${source}`} aria-hidden="true">{source === 'aihot' ? 'A' : source === 'qiaomu' ? '乔' : '归'}</span> }
function SourceLine({ article }: { article: Article }) {
  return <div className="source-line"><SourceMark source={article.source} /><span>{sourceNames[article.source] || article.source}</span><span className="dot">·</span><time dateTime={article.published_at || undefined}>{dateLabel(article.published_at)}</time>{article.is_fixture && <span className="fixture-label">演示示例</span>}</div>
}
function Coverage({ article }: { article: Article }) {
  if (!article.also_covered_by?.length) return null
  return <details className="coverage"><summary><span>另有 {article.also_covered_by.length} 篇报道</span><ChevronDown size={13} /></summary><div className="coverage-links">{article.also_covered_by.map(item => <a key={item.id} href={safeUrl(item.url)} target="_blank" rel="noreferrer">{sourceNames[item.source]} · {item.author || item.title}<ArrowRight size={13} /></a>)}<p>{article.selection_reason}</p></div></details>
}

export default function App() {
  const [route, navigate] = useRoute()
  const [feed, setFeed] = useState<Feed | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [books, setBooks] = useState<Book[]>([])
  const [excerpts, setExcerpts] = useState<Excerpt[]>([])
  const [source, setSource] = useState('all')
  const [query, setQuery] = useState('')
  const [onlySaved, setOnlySaved] = useState(false)
  const [saved, setSaved] = usePreference<string[]>('anthreed-saved-v1', [])
  const [dismissed, setDismissed] = usePreference<string[]>('anthreed-dismissed-v1', [])
  const [read, setRead] = usePreference<string[]>('anthreed-read-v1', [])
  const [theme, setTheme] = usePreference<'light' | 'dark'>('anthreed-theme-v1', 'light')
  const [fontSize, setFontSize] = usePreference<number>('anthreed-font-size-v1', 18)
  const [toast, setToast] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const statusDialog = useRef<HTMLDialogElement>(null)
  const [first, id] = route.split('/')
  const tab: Tab = first === 'bookshelf' || first === 'book' ? 'bookshelf' : first === 'excerpts' ? 'excerpts' : 'subscriptions'
  const article = first === 'article' ? feed?.articles.find(item => item.id === id) : undefined
  const book = first === 'book' ? books.find(item => item.id === id) : undefined
  const reading = first === 'article' || first === 'book'
  const notify = useCallback((message: string) => setToast(message), [])
  const refreshLocal = useCallback(async () => {
    try { setBooks(await storage.books()); setExcerpts(await storage.excerpts()) }
    catch { notify('无法使用本地存储，请确认浏览器允许保存网站数据。') }
  }, [notify])
  const refreshFeed = useCallback(async () => {
    setLoading(true); setLoadError('')
    try { setFeed(await loadFeed()) } catch (error) { setLoadError(error instanceof Error ? error.message : '读取失败，请重试。') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refreshFeed(); void refreshLocal() }, [refreshFeed, refreshLocal])
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.style.colorScheme = theme }, [theme])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    if (first === 'article' && id) setRead(current => current.includes(id) ? current : [...current, id])
  }, [first, id, setRead])
  const toggleSave = (id: string) => setSaved(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const importFile = async (file: File) => {
    setImporting(true)
    try { const result = await importEpub(file); await refreshLocal(); notify(result.duplicate ? '这本书已在书架上，阅读进度已保留。' : `《${result.book.title}》已放入书架。`) }
    catch (error) { notify(error instanceof Error ? error.message : '导入失败，请重试。') }
    finally { setImporting(false); if (fileInput.current) fileInput.current.value = '' }
  }
  const importDemo = async () => {
    try { const response = await fetch('/demo.epub'); if (!response.ok) throw new Error(); await importFile(new File([await response.blob()], '阅读的间隙.epub', { type: 'application/epub+zip' })) }
    catch { notify('示例书暂时无法读取，请从设备导入 EPUB。') }
  }
  const saveExcerpt = async (text: string, reference: Partial<Excerpt>) => {
    if (!text.trim()) { notify('请先选中一段想留下的文字。'); return }
    try {
      await storage.saveExcerpt({ id: crypto.randomUUID(), text: text.trim().slice(0, 5000), title: '', source: '', createdAt: Date.now(), ...reference })
      await refreshLocal(); notify('已保存到摘录。')
    } catch { notify('摘录保存失败，请检查设备存储空间。') }
  }
  const exportExcerpts = () => {
    const markdown = '# Anthreed · 我的摘录\n\n' + excerpts.map(item => `> ${item.text.replace(/\n/g, '\n> ')}\n\n— ${item.title} · ${item.source}\n`).join('\n---\n\n')
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'Anthreed-摘录.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const visible = (feed?.articles || []).filter(item => (source === 'all' || item.source === source) && (!onlySaved || saved.includes(item.id)) && (!query || `${item.title} ${item.summary}`.toLowerCase().includes(query.toLowerCase())))
  const themeButton = <IconButton label={theme === 'light' ? '切换深色' : '切换浅色'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</IconButton>

  return <div className={`app ${reading ? 'is-reading' : ''}`}>
    <input ref={fileInput} type="file" accept=".epub,application/epub+zip" className="visually-hidden" aria-label="选择 EPUB 文件" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void importFile(file) }} />
    {!reading && <header className="app-header"><a className="brand" href="#subscriptions" aria-label="Anthreed 首页">Anthreed</a><div className="header-actions">{themeButton}<IconButton label="订阅与数据状态" onClick={() => statusDialog.current?.showModal()}><CircleHelp size={19} /></IconButton></div></header>}
    {!reading && <main className="main-content">
      {tab === 'subscriptions' && <>
        <div className="page-heading"><div><h1>今天，读点好东西。</h1><p className="page-description">少一点噪音，多一点值得留下的思考。</p></div></div>
        <div className="source-controls"><div className="source-filters" aria-label="筛选订阅来源">{[['all', '全部'], ['guizang', '归藏'], ['qiaomu', '乔木'], ['aihot', 'AIHOT']].map(([value, label]) => <button key={value} aria-pressed={source === value} className={source === value ? 'selected' : ''} onClick={() => setSource(value)}>{label}</button>)}</div><div className="toolbar-actions"><IconButton label="只看收藏" active={onlySaved} onClick={() => setOnlySaved(!onlySaved)}><Bookmark size={17} fill={onlySaved ? 'currentColor' : 'none'} /></IconButton><IconButton label="重新读取订阅" disabled={loading} onClick={() => void refreshFeed()}><RefreshCw size={16} className={loading ? 'spin' : ''} /></IconButton></div></div>
        {feed && <div className="selection-note"><span>{feed.from_cache ? '正在阅读离线缓存' : feed.data_warning ? '云端暂不可用，正在阅读本地订阅' : feed.selection_stale ? '选稿暂不可用，保留上次已选文章' : feed.selection_mode === 'deepseek' ? '同一事件，只读最值得的一篇' : feed.selection_mode === 'local_fallback' ? '本次使用本地去重，选稿服务暂不可用' : '同一事件，只读一篇'}</span><button onClick={() => statusDialog.current?.showModal()} aria-label="查看选稿与来源状态"><CircleHelp size={13} /></button></div>}
        {loadError && <div className="empty-state compact"><FileText size={30} /><h2>订阅暂时没有送达</h2><p>{loadError}</p><button className="primary-button" onClick={() => void refreshFeed()}>再试一次</button></div>}
        {loading && !feed && <div className="loading-state"><LoaderCircle className="spin" size={24} /><p>正在打开你的阅读空间…</p></div>}
        {!loading && !loadError && visible.length > 0 && (
          <SwipeDeck
            articles={visible}
            dismissed={dismissed}
            onDismiss={(id) => setDismissed(current => current.includes(id) ? current : [...current, id])}
            onOpen={(id) => navigate(`article/${id}`)}
          />
        )}
      </>}
      {tab === 'bookshelf' && <>
        <div className="page-heading"><div><p className="eyebrow">A ROOM FOR YOUR BOOKS</p><h1>书架</h1><p className="page-description">把时间，留给想读的书。</p></div><button className="square-add" aria-label="导入 EPUB" disabled={importing} onClick={() => fileInput.current?.click()}>{importing ? <LoaderCircle className="spin" size={21} /> : <Plus size={23} />}</button></div>
        <label className="search-field"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="找一本书" aria-label="搜索书架" />{query && <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={15} /></button>}</label>
        {books.length > 0 && (() => { const current = books[0]; return <section className="continue-reading"><p className="small-label"><BookOpen size={15} />{current.openedAt ? '接着上次的地方' : '开始一本新书'}</p><button className="continue-content" onClick={() => navigate(`book/${current.id}`)}><div className="mini-cover"><BookOpen size={24} strokeWidth={1.1} /></div><div><h2>{current.title}</h2><p>{current.author}</p><div className="progress-track"><span style={{ width: `${current.progress * 100}%` }} /></div><span className="book-progress">已读 {Math.round(current.progress * 100)}%</span></div><ChevronRight size={20} /></button></section> })()}
        <div className="section-label"><h2>全部书籍 <span>{books.length}</span></h2><span>保存在这台设备</span></div>
        {books.length === 0 ? <div className="empty-state shelf-empty"><div className="book-still-life" aria-hidden="true"><span className="drawn-book one">读</span><span className="drawn-book two">阅</span><span className="drawn-book three">慢</span></div><h2>把一本书，带到这里。</h2><p>导入 EPUB，开辟一小块<br />只属于阅读的时间。</p><button className="primary-button" onClick={() => fileInput.current?.click()} disabled={importing}><Upload size={17} />{importing ? '正在放入书架…' : '从设备导入 EPUB'}</button><button className="text-button" disabled={importing} onClick={() => void importDemo()}>先试读一本示例书<ArrowRight size={14} /></button></div> : <div className="book-grid">{books.filter(item => !query || `${item.title} ${item.author}`.includes(query)).map((item, index) => <button className="book-item" key={item.id} onClick={() => navigate(`book/${item.id}`)}><div className={`book-cover cover-${index % 3}`}><span className="cover-series">Anthreed Library</span><h3>{item.title}</h3><div className="cover-symbol"><BookOpen size={32} strokeWidth={1} /></div><span className="cover-author">{item.author}</span></div><h3>{item.title}</h3><p>{item.author}</p><span className="book-progress">{item.openedAt ? `已读 ${Math.round(item.progress * 100)}%` : '还未开始'}</span></button>)}<button className="import-tile" onClick={() => fileInput.current?.click()} disabled={importing}><Plus size={24} /><span>再放一本书</span></button></div>}
        <div className="local-note"><Library size={17} /><p>书与进度都留在本机。<br /><span>导入的 EPUB 不会上传到云端。</span></p></div>
      </>}
      {tab === 'excerpts' && <>
        <div className="page-heading"><div><p className="eyebrow">WORDS WORTH KEEPING</p><h1>摘录</h1><p className="page-description">有些文字，值得再遇见一次。</p></div><IconButton label="导出摘录为 Markdown" disabled={!excerpts.length} onClick={exportExcerpts}><ArrowDownToLine size={20} /></IconButton></div>
        <div className="section-label"><h2>留下的片段 <span>{excerpts.length}</span></h2><span>只在本机保存</span></div>
        {!excerpts.length ? <div className="empty-state excerpts-empty"><span className="large-quote" aria-hidden="true">“</span><h2>让触动你的文字，留下来。</h2><p>阅读时选中一句话，保存到摘录。<br />以后，还能回到那一页。</p><button className="secondary-button" onClick={() => navigate('subscriptions')}>去读一篇文章<ArrowRight size={16} /></button></div> : <div className="excerpt-list">{excerpts.map(item => <article className="excerpt-card" key={item.id}><Quote size={21} strokeWidth={1.2} /><blockquote>{item.text}</blockquote><button className="excerpt-origin" onClick={() => navigate(item.articleId ? `article/${item.articleId}` : `book/${item.bookId}`)}><span>{item.title}</span><ChevronRight size={14} /></button><div className="excerpt-bottom"><span>{item.source} · {dateLabel(new Date(item.createdAt).toISOString())}</span><IconButton label="删除这条摘录" onClick={() => { void storage.deleteExcerpt(item.id).then(refreshLocal).catch(() => notify('删除失败，请重试。')) }}><Trash2 size={14} /></IconButton></div></article>)}</div>}
      </>}
    </main>}
    {first === 'article' && (article ? <div className="article-expand"><ArticleReader key={article.id} article={article} onBack={() => navigate('subscriptions')} fontSize={fontSize} onFont={() => setFontSize(fontSize >= 24 ? 16 : fontSize + 2)} themeButton={themeButton} saved={saved.includes(article.id)} onSave={() => toggleSave(article.id)} onExcerpt={text => void saveExcerpt(text, { title: article.title, source: sourceNames[article.source], articleId: article.id })} /></div> : <div className="empty-state"><p>{loading ? '正在打开文章…' : '这篇文章暂不在当前订阅中。'}</p><button className="text-button" onClick={() => navigate('subscriptions')}>返回订阅</button></div>)}
    {first === 'book' && (book ? <NovelReader key={book.id} book={book} theme={theme} onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} onBack={() => { void refreshLocal(); navigate('bookshelf') }} onExcerpt={(text) => void saveExcerpt(text, { title: book.title, source: book.author, bookId: book.id })} notify={notify} /> : <div className="empty-state"><p>正在查找这台设备上的书籍…</p><button className="text-button" onClick={() => navigate('bookshelf')}>返回书架</button></div>)}
    {!reading && <nav className="bottom-nav" aria-label="主导航">{(Object.keys(labels) as Tab[]).map(item => { const Icon = icons[item]; return <a key={item} href={`#${item}`} aria-current={tab === item ? 'page' : undefined} className={tab === item ? 'selected' : ''} onClick={() => setQuery('')}><span className="nav-icon"><Icon size={21} strokeWidth={tab === item ? 2 : 1.5} /></span><span>{labels[item]}</span></a> })}</nav>}
    <dialog ref={statusDialog} className="status-dialog" onClick={event => { if (event.target === statusDialog.current) statusDialog.current.close() }}><div className="dialog-heading"><h2>阅读空间</h2><IconButton label="关闭数据状态" onClick={() => statusDialog.current?.close()}><X size={19} /></IconButton></div><p className="page-description">订阅与选稿状态</p>{feed && <><div className="selection-stats"><span><strong>{feed.input_count}</strong>篇来源文章</span><ArrowRight size={20} /><span><strong>{feed.articles.length}</strong>个独立事件</span></div><p className="status-explanation">{feed.selection_mode === 'deepseek' ? 'DeepSeek 按事件合并报道，每组保留一篇，并记录选稿理由。' : feed.selection_mode === 'local_fallback' ? '本轮模型服务不可用，使用本地标题相似度去重。' : '每个事件保留一篇文章，选稿状态暂未同步。'}</p>{feed.data_warning && <p className="status-explanation" role="status">{feed.data_warning}</p>}{feed.sources.map(item => <div className="status-source" key={item.id}><SourceMark source={item.id} /><div><strong>{item.name}</strong><p>{item.method || '来源暂不可用'} · {item.count} 篇</p>{item.note && <p>{item.note}</p>}</div><span className={`status-badge ${item.status === 'ok' ? 'ok' : ''}`}>{item.status === 'ok' ? '已更新' : item.status === 'cached' ? '已缓存' : '未连接'}</span></div>)}<p className="update-time">数据生成于 {new Date(feed.generated_at).toLocaleString('zh-CN', { hour12: false })}</p></>}<div className="dialog-footer"><p>{feed?.data_origin === 'supabase' ? '订阅已从云端同步。' : feed?.from_cache ? '正在显示这台设备保存的订阅。' : '正在显示本地订阅。'}<br />书架和摘录保存在这台设备。</p><button className="secondary-button" onClick={() => { void refreshFeed(); statusDialog.current?.close() }}><RefreshCw size={15} />重新读取</button></div></dialog>
    {toast && <div className="toast" role="status"><Check size={16} /><span>{toast}</span></div>}
  </div>
}

function ArticleReader({ article, onBack, fontSize, onFont, themeButton, saved, onSave, onExcerpt }: {
  article: Article; onBack: () => void; fontSize: number; onFont: () => void; themeButton: ReactNode; saved: boolean; onSave: () => void; onExcerpt: (text: string) => void
}) {
  const content = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState('')
  const body = articleContent(article)
  return <>
    <header className="reader-toolbar"><button className="back-button" onClick={onBack}><ArrowLeft size={19} />订阅</button><div className="header-actions"><IconButton label={`调整字号，当前 ${fontSize}`} onClick={onFont}><Type size={19} /></IconButton>{themeButton}<IconButton label={saved ? '取消收藏' : '收藏文章'} active={saved} onClick={onSave}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></IconButton></div></header>
    <main className="reading-content"><div className="reader-kicker"><BookOpen size={15} /><span>留一点时间，好好读。</span></div><SourceLine article={article} /><h1>{article.title}</h1><div className="reading-meta"><span>{article.author || sourceNames[article.source]}</span><span>{dateLabel(article.published_at, true)}</span></div>
      {body ? <><div className="reading-body" ref={content} style={{ fontSize }} onPointerUp={() => { const selected = window.getSelection(); setSelection(selected && content.current?.contains(selected.anchorNode) && content.current?.contains(selected.focusNode) ? selected.toString() : '') }}>{body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><div className="reading-end-mark" aria-hidden="true">◇</div></> : <><div className="body-empty"><FileText size={24} strokeWidth={1.3} /><h2>正文尚未同步</h2><p>本次未能获取完整正文，同步成功后会在这里显示。</p></div>{article.summary?.trim() && <aside className="summary-notice"><h2>来源摘要</h2><p>{article.summary}</p></aside>}</>}
      <Coverage article={article} />
      {(body || article.summary?.trim()) && <button className="excerpt-action" onPointerDown={event => event.preventDefault()} onClick={() => onExcerpt(body ? selection : article.summary)}><Highlighter size={17} />{body ? '摘录选中文字' : '保存这段摘要到摘录'}</button>}<p className="reading-footnote">内容版权归原作者所有 · 保留每一份思考的出处</p>
    </main>
  </>
}
