import type { Contents, Rendition } from 'epubjs'

export type ReaderTheme = 'light' | 'dark'

export const PALETTES = {
  light: { paper: '#f9f9f7', ink: '#2c2c2a', link: '#d97757' },
  dark: { paper: '#0b0b0b', ink: '#e8e6e1', link: '#cc6b49' },
}

function themeCss(theme: ReaderTheme, lineHeight: number) {
  const { paper, ink, link } = PALETTES[theme]
  return `
    html[data-anthreed-theme], html[data-anthreed-theme] body {
      background: ${paper} !important; color: ${ink} !important;
      color-scheme: ${theme === 'dark' ? 'dark' : 'light'};
    }
    html[data-anthreed-theme] body {
      font-family: "Newsreader", "Noto Serif SC", "Songti SC", serif !important;
      line-height: ${lineHeight} !important;
    }
    html[data-anthreed-theme] body * {
      color: ${ink} !important; -webkit-text-fill-color: currentColor !important;
      background-color: transparent !important;
    }
    html[data-anthreed-theme] :is(h1, h2, h3, h4, h5, h6) {
      font-family: "Newsreader", "Noto Serif SC", serif !important;
      line-height: 1.45 !important; font-weight: 500 !important;
    }
    html[data-anthreed-theme] body a, html[data-anthreed-theme] body a * {
      color: ${link} !important;
    }
    html[data-anthreed-theme] ::selection {
      background: ${theme === 'dark' ? '#4a3228' : '#f0d9cc'} !important;
      color: ${theme === 'dark' ? '#ffffff' : '#2c2c2a'} !important;
    }
    html[data-anthreed-theme] img { max-width: 100% !important; object-fit: contain; }
  `
}

export function applyContentTheme(contents: Contents, theme: ReaderTheme, lineHeight = 1.85) {
  const doc = contents.document
  if (!doc?.body) return
  doc.documentElement.dataset.anthreedTheme = theme
  void contents.addStylesheetCss(themeCss(theme, lineHeight), 'default')
  const palette = PALETTES[theme]
  for (const element of [doc.documentElement, doc.body]) {
    element.style.setProperty('color', palette.ink, 'important')
    element.style.setProperty('background-color', palette.paper, 'important')
  }
}

export function applyTheme(rendition: Rendition, theme: ReaderTheme, lineHeight = 1.85) {
  rendition.themes.registerCss('default', themeCss(theme, lineHeight))
  rendition.themes.override('color', PALETTES[theme].ink, true)
  const contents = rendition.getContents() as unknown as Contents[]
  contents.forEach(content => applyContentTheme(content, theme, lineHeight))
}
