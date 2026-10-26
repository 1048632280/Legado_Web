import { invoke } from '@tauri-apps/api/core'
import type { BaseBook, Book, BookChapter, BookProgress } from '@/book'
import type { webReadConfig } from '@/web'
import { DEFAULT_READ_CONFIG, normalizeReadConfig } from '@/config/readConfig'
import {
  normalizeContentFilterRules,
  type ContentFilterRule,
} from '@/utils/contentFilter'
import type { ReadingRecentBook } from '@/utils/bookshelf'
import type { LegadoApiResponse } from './api'

type ApiResult<T> = Promise<{ data: LegadoApiResponse<T> }>

type ChapterRecord = BookChapter & {
  id: string
  content: string
}

export type LocalTextFile = {
  path: string
  name: string
  size: number
  lastModified: number
  bytes: number[]
}

const ok = <T>(data: T): { data: LegadoApiResponse<T> } => ({
  data: { isSuccess: true, errorMsg: '', data },
})

const fail = <T>(
  errorMsg: string,
  data: T = undefined as T,
): { data: LegadoApiResponse<T> } => ({
  data: { isSuccess: false, errorMsg, data },
})

const invokeLocal = <T>(command: string, args?: Record<string, unknown>) =>
  invoke<T>(command, args)

const chapterId = (bookUrl: string, index: number) => `${bookUrl}#${index}`

const getAllBooks = () => invokeLocal<Book[]>('list_local_books')

const getBook = async (bookUrl: string) => {
  const books = await getAllBooks()
  return books.find(book => book.bookUrl === bookUrl)
}

const getChapterRecords = async (bookUrl: string) => {
  const snapshot = await invokeLocal<{ book: Book; chapters: ChapterRecord[] }>(
    'read_local_book',
    { bookUrl },
  )
  return snapshot.chapters.sort((left, right) => left.index - right.index)
}

const getChapterRecord = async (bookUrl: string, index: number) => {
  const chapters = await getChapterRecords(bookUrl)
  return chapters.find(chapter => chapter.index === index)
}

const toBookChapter = (chapter: ChapterRecord): BookChapter => ({
  url: chapter.url,
  title: chapter.title,
  isVolume: chapter.isVolume,
  baseUrl: chapter.baseUrl,
  bookUrl: chapter.bookUrl,
  index: chapter.index,
  isVip: chapter.isVip,
  isPay: chapter.isPay,
})

const readConfig = async () => {
  const value = await invokeLocal<webReadConfig | null>('read_local_config')
  return value === null ? normalizeReadConfig(DEFAULT_READ_CONFIG) : normalizeReadConfig(value)
}

const writeConfig = (config: webReadConfig) =>
  invokeLocal('write_local_config', { config: normalizeReadConfig(config) })

const readRecent = async () =>
  invokeLocal<ReadingRecentBook | null>('read_local_recent')

const writeRecent = (recent: ReadingRecentBook | undefined) =>
  invokeLocal('write_local_recent', { recent: recent ?? null })

const readContentFilterRules = (bookUrl: string) =>
  invokeLocal<ContentFilterRule[]>('read_local_filters', { bookUrl })

const writeContentFilterRules = (bookUrl: string, rules: ContentFilterRule[]) =>
  invokeLocal('write_local_filters', { bookUrl, rules })

const normalizeText = (text: string) =>
  text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()

const chapterTitlePattern =
  /^\s*((第\s*[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+\s*[章节卷回集部篇].{0,50})|(序章|楔子|引子|前言|后记|终章|番外).{0,50}|(chapter|section)\s+\d+.{0,60})\s*$/i

type ParsedChapter = { title: string; content: string }

const splitTextByLength = (text: string, maxLength = 12000): ParsedChapter[] => {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(item => item.trim())
    .filter(Boolean)
  const chapters: ParsedChapter[] = []
  let buffer: string[] = []
  let size = 0
  const flush = () => {
    if (buffer.length === 0) return
    chapters.push({ title: `第 ${chapters.length + 1} 章`, content: buffer.join('\n\n') })
    buffer = []
    size = 0
  }
  paragraphs.forEach(paragraph => {
    if (size > 0 && size + paragraph.length > maxLength) flush()
    buffer.push(paragraph)
    size += paragraph.length
  })
  flush()
  if (chapters.length === 0 && text.length > 0) {
    chapters.push({ title: '正文', content: text })
  }
  return chapters
}

const parseTextChapters = (rawText: string): ParsedChapter[] => {
  const text = normalizeText(rawText)
  const lines = text.split('\n')
  const titles = lines
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(({ line }) => {
      const title = line.trim()
      return title.length > 0 && title.length <= 80 && chapterTitlePattern.test(title)
    })
    .map(({ line, lineIndex }) => ({ title: line.trim(), lineIndex }))

  if (titles.length < 2) return splitTextByLength(text)

  const chapters: ParsedChapter[] = []
  const preface = lines.slice(0, titles[0].lineIndex).join('\n').trim()
  if (preface) chapters.push({ title: '前言', content: preface })
  titles.forEach((current, index) => {
    const next = titles[index + 1]
    const content = lines
      .slice(current.lineIndex + 1, next?.lineIndex ?? lines.length)
      .join('\n')
      .trim()
    chapters.push({ title: current.title, content: content || current.title })
  })
  return chapters
}

const readFileBytes = async (file: File | LocalTextFile) => {
  if ('path' in file) return Uint8Array.from(file.bytes)
  return new Uint8Array(await file.arrayBuffer())
}

const readTextFile = async (file: File | LocalTextFile) => {
  const bytes = await readFileBytes(file)
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const brokenChars = utf8.match(/\uFFFD/g)?.length ?? 0
  if (brokenChars <= Math.max(20, utf8.length * 0.001)) return { text: utf8, bytes }
  try {
    return { text: new TextDecoder('gb18030').decode(bytes), bytes }
  } catch {
    return { text: utf8, bytes }
  }
}

const buildBook = (
  file: File | LocalTextFile,
  chapters: ParsedChapter[],
): Book => {
  const now = Date.now()
  const identity = 'path' in file ? file.path : file.name
  const bookUrl = `local-book://${encodeURIComponent(identity)}/${file.size}/${file.lastModified}`
  return {
    name: file.name.replace(/\.[^.]+$/, ''),
    author: '本地导入',
    bookUrl,
    tocUrl: bookUrl,
    origin: 'local',
    originName: file.name,
    type: 0,
    group: 0,
    latestChapterTitle: chapters.at(-1)?.title ?? '正文',
    latestChapterTime: now,
    lastCheckTime: now,
    lastCheckCount: 0,
    totalChapterNum: chapters.length,
    durChapterTitle: chapters[0]?.title ?? '正文',
    durChapterIndex: 0,
    durChapterPos: 0,
    durChapterTime: now,
    canUpdate: false,
    order: now,
    originOrder: 0,
    syncTime: now,
  }
}

const getReadConfig = async (): Promise<webReadConfig> => readConfig()

const saveReadConfig = async (config: webReadConfig): ApiResult<string> => {
  await writeConfig(config)
  return ok('阅读配置已保存到本地 data 目录')
}

const getBookShelf = async (): ApiResult<Book[]> => {
  const books = await getAllBooks()
  return ok(books.sort((left, right) => right.durChapterTime - left.durChapterTime))
}

const getChapterList = async (bookUrl: string): ApiResult<BookChapter[]> => {
  const chapters = await getChapterRecords(bookUrl)
  return chapters.length === 0
    ? fail('这本书还没有章节，请重新导入')
    : ok(chapters.map(toBookChapter))
}

const getBookContent = async (bookUrl: string, index: number): ApiResult<string> => {
  const chapter = await getChapterRecord(bookUrl, index)
  return chapter === undefined ? fail('章节不存在或已被删除') : ok(chapter.content)
}

const getContentFilterRules = async (
  bookUrl: string,
): ApiResult<ContentFilterRule[]> => ok(await readContentFilterRules(bookUrl))

const saveContentFilterRules = async (
  bookUrl: string,
  rules: ContentFilterRule[],
): ApiResult<ContentFilterRule[]> => {
  const normalizedRules = normalizeContentFilterRules(rules)
  await writeContentFilterRules(bookUrl, normalizedRules)
  return ok(normalizedRules)
}

const deleteContentFilterRules = async (bookUrl: string): ApiResult<string> => {
  await writeContentFilterRules(bookUrl, [])
  return ok('书籍过滤规则已删除')
}

const saveBookProgress = async (progress: BookProgress): ApiResult<string> => {
  const book = await getBook(progress.bookUrl)
  if (book === undefined) return ok('没有需要保存的本地进度')
  await invokeLocal('update_local_book', {
    book: { ...book, ...progress, syncTime: Date.now() },
  })
  return ok('阅读进度已保存到本地 data 目录')
}

const importLocalTextBook = async (
  file: File | LocalTextFile,
): ApiResult<Book> => {
  if (!file.name.toLocaleLowerCase().endsWith('.txt')) {
    return fail('当前版本仅支持导入 TXT 文本书籍')
  }
  const { text, bytes } = await readTextFile(file)
  const chapters = parseTextChapters(text)
  const book = buildBook(file, chapters)
  const records = chapters.map((chapter, index): ChapterRecord => ({
    id: chapterId(book.bookUrl, index),
    url: `${book.bookUrl}/chapter/${index}`,
    title: chapter.title,
    isVolume: false,
    baseUrl: book.bookUrl,
    bookUrl: book.bookUrl,
    index,
    isVip: false,
    isPay: true,
    content: chapter.content,
  }))
  await invokeLocal('save_local_book', {
    book,
    chapters: records,
    source: Array.from(bytes),
  })
  return ok(book)
}

const deleteBook = async (book: BaseBook): ApiResult<string> => {
  await invokeLocal('delete_local_book', { bookUrl: book.bookUrl })
  return ok('书籍已从本地 data 目录删除')
}

const clearStandaloneData = async (): ApiResult<string> => {
  try {
    await invokeLocal('clear_local_data')
    return ok('本地 data 目录已清空')
  } catch (error) {
    return fail(error instanceof Error ? error.message : '清空数据失败')
  }
}

const getReadingRecent = async () => readRecent()

const saveReadingRecent = async (recent: ReadingRecentBook) => {
  await writeRecent(recent)
}

const clearReadingRecent = async () => {
  await writeRecent(undefined)
}

const readLocalTextFiles = (paths: string[]) =>
  invokeLocal<LocalTextFile[]>('read_local_text_files', { paths })

export default {
  getReadConfig,
  saveReadConfig,
  saveBookProgress,
  saveBookProgressWithBeacon: saveBookProgress,
  getBookShelf,
  getChapterList,
  getBookContent,
  getContentFilterRules,
  saveContentFilterRules,
  deleteContentFilterRules,
  importLocalTextBook,
  readLocalTextFiles,
  getReadingRecent,
  saveReadingRecent,
  clearReadingRecent,
  deleteBook,
  clearStandaloneData,
}
