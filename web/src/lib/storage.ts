import { openDB, type DBSchema } from 'idb'
import JSZip from 'jszip'

export type Block = { type: 'heading' | 'paragraph'; text: string }
export type Chapter = { title: string; blocks: Block[] }
export type Book = {
  id: string; title: string; author: string; filename: string; data: ArrayBuffer
  chapters: Chapter[]; addedAt: number; openedAt: number; chapter: number; offset: number; progress: number; location?: string; chapterLabel?: string
}
export type Excerpt = { id: string; text: string; title: string; source: string; createdAt: number; articleId?: string; bookId?: string; chapter?: number }
interface ReaderDB extends DBSchema {
  books: { key: string; value: Book }
  excerpts: { key: string; value: Excerpt }
}
const database = () => openDB<ReaderDB>('anthreed-v1', 1, { upgrade(db) {
  db.createObjectStore('books', { keyPath: 'id' }); db.createObjectStore('excerpts', { keyPath: 'id' })
} })
export const storage = {
  books: async () => (await (await database()).getAll('books')).sort((a, b) => b.openedAt - a.openedAt || b.addedAt - a.addedAt),
  saveBook: async (book: Book) => (await database()).put('books', book),
  updateBook: async (id: string, update: Partial<Pick<Book, 'chapter' | 'offset' | 'progress' | 'openedAt' | 'location' | 'chapterLabel'>>) => {
    const tx = (await database()).transaction('books', 'readwrite')
    const book = await tx.store.get(id)
    if (book) await tx.store.put({ ...book, ...update })
    await tx.done
  },
  excerpts: async () => (await (await database()).getAll('excerpts')).sort((a, b) => b.createdAt - a.createdAt),
  saveExcerpt: async (excerpt: Excerpt) => (await database()).put('excerpts', excerpt),
  deleteExcerpt: async (id: string) => (await database()).delete('excerpts', id),
}

function xml(text: string) {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('EPUB 文件结构无法读取，请尝试其他无 DRM 的 EPUB。')
  return document
}
const elements = (root: Document, name: string) => Array.from(root.getElementsByTagNameNS('*', name))

export async function importEpub(file: File): Promise<{ book: Book; duplicate: boolean }> {
  if (!file.name.toLowerCase().endsWith('.epub')) throw new Error('请选择 .epub 格式的电子书。')
  if (file.size > 40 * 1024 * 1024) throw new Error('演示版支持 40 MB 以内的 EPUB。')
  const data = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', data)
  const id = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  const existing = await (await database()).get('books', id)
  if (existing) return { book: existing, duplicate: true }
  let zip: JSZip
  try { zip = await JSZip.loadAsync(data) } catch { throw new Error('这本书无法打开，文件可能已损坏。') }
  if (zip.file('META-INF/encryption.xml')) throw new Error('演示版暂不支持加密或 DRM EPUB。')
  let extractedBytes = 0
  const textFile = async (path: string) => {
    const entry = zip.file(path)
    if (!entry) throw new Error('EPUB 缺少必要的内容文件。')
    // JSZip exposes the uncompressed size before extraction; reject oversized files.
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0
    extractedBytes += size
    if (size > 4_000_000 || extractedBytes > 12_000_000) throw new Error('这本书的文字内容过大，暂时无法导入。')
    return entry.async('string')
  }
  const container = xml(await textFile('META-INF/container.xml'))
  const packagePath = elements(container, 'rootfile')[0]?.getAttribute('full-path')
  if (!packagePath) throw new Error('没有找到 EPUB 的书籍目录。')
  const opf = xml(await textFile(packagePath))
  const title = elements(opf, 'title')[0]?.textContent?.trim() || file.name.replace(/\.epub$/i, '')
  const author = elements(opf, 'creator')[0]?.textContent?.trim() || '作者未提供'
  const manifest = new Map(elements(opf, 'item').map(item => [item.getAttribute('id'), item]))
  const spine = elements(opf, 'itemref').filter(item => item.getAttribute('linear') !== 'no')
  if (spine.length > 500) throw new Error('演示版暂不支持超过 500 个章节的书籍。')
  const chapters: Chapter[] = []
  for (const ref of spine) {
    const item = manifest.get(ref.getAttribute('idref'))
    const href = item?.getAttribute('href')
    if (!href || !/xhtml|html/.test(item?.getAttribute('media-type') || '')) continue
    const path = decodeURIComponent(new URL(href, `https://epub.local/${packagePath}`).pathname.slice(1))
    const raw = await textFile(path)
    // Convert to text blocks. No imported markup, scripts, styles, iframe or remote
    // resources ever enter the page. The original EPUB remains in IndexedDB.
    const doc = new DOMParser().parseFromString(raw, 'text/html')
    doc.querySelectorAll('script,style,iframe,object,svg,nav').forEach(node => node.remove())
    const blocks: Block[] = Array.from(doc.querySelectorAll('h1,h2,h3,h4,p,li,blockquote'))
      .filter(node => !node.parentElement?.closest('p,li,blockquote'))
      .map(node => ({ type: /^H/.test(node.tagName) ? 'heading' as const : 'paragraph' as const, text: node.textContent?.trim() || '' })).filter(block => block.text)
    if (!blocks.length && doc.body.textContent?.trim()) blocks.push({ type: 'paragraph', text: doc.body.textContent.trim() })
    if (blocks.length) chapters.push({ title: blocks.find(block => block.type === 'heading')?.text || `第 ${chapters.length + 1} 章`, blocks })
  }
  if (!chapters.length) throw new Error('未找到可读取的文字章节，请选择常规排版的 EPUB。')
  const book: Book = { id, title, author, filename: file.name, data, chapters, addedAt: Date.now(), openedAt: 0, chapter: 0, offset: 0, progress: 0 }
  await storage.saveBook(book)
  return { book, duplicate: false }
}
