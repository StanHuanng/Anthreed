import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EpubView } from 'react-reader'
import type { Contents, NavItem, Rendition } from 'epubjs'
import { ArrowLeft, AlignLeft, BookOpen, Check, Columns2, List, Moon, Sun, Type, X } from 'lucide-react'
import { applyContentTheme, applyTheme, type ReaderTheme } from '../lib/readerTheme'
import { storage, type Book } from '../lib/storage'

type FlowMode = 'paginated' | 'scrolled'

type Props = {
  book: Book
  theme: ReaderTheme
  onToggleTheme: () => void
  onBack: () => void
  onExcerpt: (text: string) => void
  notify: (text: string) => void
}

function IconButton({ children, label, onClick, active = false }: { children: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return <button className={`icon-button ${active ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={active} onClick={onClick}>{children}</button>
}

export function NovelReader({ book, theme, onToggleTheme, onBack, onExcerpt, notify }: Props) {
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    try { return Number(localStorage.getItem('anthreed-reader-font') || 20) } catch { return 20 }
  })
  const [lineHeight, setLineHeight] = useState(() => {
    try { return Number(localStorage.getItem('anthreed-reader-lh') || 1.85) } catch { return 1.85 }
  })
  const [flow, setFlow] = useState<FlowMode>(() => {
    try { return (localStorage.getItem('anthreed-reader-flow') as FlowMode) || 'paginated' } catch { return 'paginated' }
  })
  const [location, setLocation] = useState<string | number>((book as Book & { location?: string }).location || book.chapter || 0)
  const [progress, setProgress] = useState(book.progress || 0)
  const [toc, setToc] = useState<NavItem[]>([])
  const [chapterLabel, setChapterLabel] = useState('')
  const [chromeVisible, setChromeVisible] = useState(true)
  const renditionRef = useRef<Rendition | null>(null)
  const url = useMemo(() => URL.createObjectURL(new Blob([book.data], { type: 'application/epub+zip' })), [book.data])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => URL.revokeObjectURL(url), [url])
  useEffect(() => { try { localStorage.setItem('anthreed-reader-font', String(fontSize)) } catch { /* optional */ } }, [fontSize])
  useEffect(() => { try { localStorage.setItem('anthreed-reader-lh', String(lineHeight)) } catch { /* optional */ } }, [lineHeight])
  useEffect(() => { try { localStorage.setItem('anthreed-reader-flow', flow) } catch { /* optional */ } }, [flow])

  const persist = useCallback((next: { location?: string; progress?: number; chapter?: string }) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void storage.updateBook(book.id, {
        progress: next.progress ?? progress,
        openedAt: Date.now(),
        location: typeof next.location === 'string' ? next.location : undefined,
        chapterLabel: next.chapter,
      }).catch(() => notify('进度未能保存，请检查本机存储。'))
    }, 320)
  }, [book.id, notify, progress])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.themes.fontSize(`${fontSize}px`)
    applyTheme(rendition, theme, lineHeight)
  }, [fontSize, theme, lineHeight])

  const getRendition = useCallback((rendition: Rendition) => {
    renditionRef.current = rendition
    applyTheme(rendition, theme, lineHeight)
    rendition.themes.fontSize(`${fontSize}px`)
    rendition.hooks.content.register((contents: Contents) => {
      applyContentTheme(contents, theme, lineHeight)
      contents.document.addEventListener('click', () => setChromeVisible(v => !v))
      contents.document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); void rendition.prev() }
        if (event.key === 'ArrowRight') { event.preventDefault(); void rendition.next() }
      })
    })
    rendition.on('relocated', (position: { start: { cfi: string; href: string; index: number; displayed: { page: number; total: number } }; atEnd: boolean }) => {
      const start = position.start
      const item = rendition.book.navigation.get(start.href)
      const spine = rendition.book.spine as unknown as { length: number }
      const nextProgress = position.atEnd ? 1 : (start.index + (start.displayed.page - 1) / Math.max(1, start.displayed.total)) / Math.max(1, spine.length)
      const label = item?.label?.trim() || '正文'
      setLocation(start.cfi)
      setProgress(nextProgress)
      setChapterLabel(label)
      persist({ location: start.cfi, progress: nextProgress, chapter: label })
    })
    void rendition.book.loaded.navigation.then(nav => setToc(nav.toc || []))
  }, [fontSize, lineHeight, persist, theme])

  const readerKey = `${book.id}-${flow}`

  return (
    <div className={`novel-reader theme-${theme} ${chromeVisible ? 'chrome-on' : 'chrome-off'}`}>
      <header className="novel-toolbar">
        <button className="back-button" onClick={() => {
          void storage.updateBook(book.id, { progress, openedAt: Date.now(), location: typeof location === 'string' ? location : undefined }).then(onBack).catch(() => notify('进度保存失败，请重试。'))
        }}><ArrowLeft size={19} />书架</button>
        <div className="novel-title-block">
          <span className="novel-book-title">{book.title}</span>
          {chapterLabel && <span className="novel-chapter">{chapterLabel}</span>}
        </div>
        <div className="header-actions">
          <IconButton label="目录" active={tocOpen} onClick={() => { setTocOpen(v => !v); setSettingsOpen(false) }}><List size={19} /></IconButton>
          <IconButton label="阅读设置" active={settingsOpen} onClick={() => { setSettingsOpen(v => !v); setTocOpen(false) }}><Type size={19} /></IconButton>
          <IconButton label={theme === 'light' ? '切换深色' : '切换浅色'} onClick={onToggleTheme}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</IconButton>
        </div>
      </header>

      {tocOpen && (
        <aside className="novel-toc" aria-label="目录">
          <div className="novel-toc-head"><h2>目录</h2><button aria-label="关闭目录" onClick={() => setTocOpen(false)}><X size={18} /></button></div>
          <div className="novel-toc-list">
            {(toc.length ? toc : book.chapters.map((c, i) => ({ id: String(i), label: c.title, href: String(i) }))).map((item, index) => (
              <button key={`${item.href}-${index}`} onClick={() => {
                setLocation(item.href || index)
                setTocOpen(false)
                if (renditionRef.current && item.href) void renditionRef.current.display(item.href)
              }}>{item.label || `第 ${index + 1} 章`}</button>
            ))}
          </div>
        </aside>
      )}

      {settingsOpen && (
        <div className="novel-settings" role="dialog" aria-label="阅读设置">
          <label className="novel-setting-row"><span>字号</span>
            <input type="range" min={16} max={28} step={1} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} />
            <em>{fontSize}</em>
          </label>
          <label className="novel-setting-row"><span>行距</span>
            <input type="range" min={1.5} max={2.2} step={0.05} value={lineHeight} onChange={e => setLineHeight(Number(e.target.value))} />
            <em>{lineHeight.toFixed(2)}</em>
          </label>
          <div className="novel-setting-row">
            <span>翻页</span>
            <div className="novel-flow-toggle">
              <button className={flow === 'paginated' ? 'selected' : ''} onClick={() => setFlow('paginated')}><Columns2 size={15} />仿真翻页</button>
              <button className={flow === 'scrolled' ? 'selected' : ''} onClick={() => setFlow('scrolled')}><AlignLeft size={15} />滚动</button>
            </div>
          </div>
        </div>
      )}

      <div className="novel-stage">
        <EpubView
          key={readerKey}
          url={url}
          location={location}
          locationChanged={(cfi: string) => setLocation(cfi)}
          getRendition={getRendition}
          epubInitOptions={{ openAs: 'epub' }}
          epubOptions={{
            allowScriptedContent: false,
            flow: flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
            manager: flow === 'scrolled' ? 'continuous' : 'default',
          }}
        />
      </div>

      <div className="novel-nav-edges" aria-hidden="true">
        <button className="novel-edge prev" onClick={() => void renditionRef.current?.prev()} aria-label="上一页" />
        <button className="novel-edge next" onClick={() => void renditionRef.current?.next()} aria-label="下一页" />
      </div>

      <footer className="novel-progress">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
        <p>
          <span><BookOpen size={12} />{Math.round(progress * 100)}%</span>
          <button className="excerpt-mini" onClick={() => {
            const sel = window.getSelection()?.toString() || ''
            onExcerpt(sel)
          }}>摘录选中</button>
          <span><Check size={12} />本机续读</span>
        </p>
      </footer>
    </div>
  )
}
