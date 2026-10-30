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

export type ChapterRecord = BookChapter & { content: string }

export type LocalTextFile = {
  path: string
  name: string
  size: number
  lastModified: number
  bytes: number[]
}

export type LocalReaderStorage = {
  dataDescription: string
  configSavedMessage: string
  clearMessage: string
  listBooks: () => Promise<Book[]>
  readBook: (
    bookUrl: string,
  ) => Promise<{ book: Book; chapters: ChapterRecord[] } | undefined>
  saveBook: (
    book: Book,
    chapters: ChapterRecord[],
    source: Uint8Array,
  ) => Promise<void>
  updateBook: (book: Book) => Promise<void>
  deleteBook: (bookUrl: string) => Promise<void>
  readConfig: () => Promise<webReadConfig | null>
  writeConfig: (config: webReadConfig) => Promise<void>
  readRecent: () => Promise<ReadingRecentBook | null>
  writeRecent: (recent: ReadingRecentBook | null) => Promise<void>
  readFilters: (bookUrl: string) => Promise<ContentFilterRule[]>
  writeFilters: (bookUrl: string, rules: ContentFilterRule[]) => Promise<void>
  clear: () => Promise<void>
  readTextFiles?: (paths: string[]) => Promise<LocalTextFile[]>
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

const chapterTitlePattern =
  /^\s*((第\s*[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+\s*[章节卷回集部篇].{0,50})|(序章|楔子|引子|前言|后记|终章|番外).{0,50}|(chapter|section)\s+\d+.{0,60})\s*$/i

type ParsedChapter = { title: string; content: string }

const normalizeText = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()

const splitTextByLength = (
  text: string,
  maxLength = 12000,
): ParsedChapter[] => {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(item => item.trim())
    .filter(Boolean)
  const chapters: ParsedChapter[] = []
  let buffer: string[] = []
  let size = 0
  const flush = () => {
    if (buffer.length === 0) return
    chapters.push({
      title: '第 ' + (chapters.length + 1) + ' 章',
      content: buffer.join('\n\n'),
    })
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
      return (
        title.length > 0 &&
        title.length <= 80 &&
        chapterTitlePattern.test(title)
      )
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
  if (brokenChars <= Math.max(20, utf8.length * 0.001))
    return { text: utf8, bytes }
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
  const identity =
    'path' in file ? file.path : file.webkitRelativePath || file.name
  const bookUrl =
    'local-book://' +
    encodeURIComponent(identity) +
    '/' +
    file.size +
    '/' +
    file.lastModified
  return {
    name: file.name.replace(/\.[^.]+$/, ''),
    author: '本地导入',
    bookUrl,
    latestChapterTitle: chapters.at(-1)?.title ?? '正文',
    lastCheckTime: now,
    totalChapterNum: chapters.length,
    durChapterTitle: chapters[0]?.title ?? '正文',
    durChapterIndex: 0,
    durChapterPos: 0,
    durChapterTime: now,
  }
}

export const createLocalReaderApi = (storage: LocalReaderStorage) => {
  const getAllBooks = () => storage.listBooks()

  const getBook = async (bookUrl: string) => {
    const books = await getAllBooks()
    return books.find(book => book.bookUrl === bookUrl)
  }

  const getChapterRecords = async (bookUrl: string) =>
    (await storage.readBook(bookUrl))?.chapters.sort(
      (left, right) => left.index - right.index,
    ) ?? []

  const readConfig = async () => {
    const value = await storage.readConfig()
    return value === null
      ? normalizeReadConfig(DEFAULT_READ_CONFIG)
      : normalizeReadConfig(value)
  }

  const getReadConfig = async (): Promise<webReadConfig> => readConfig()

  const saveReadConfig = async (config: webReadConfig): ApiResult<string> => {
    await storage.writeConfig(normalizeReadConfig(config))
    return ok(storage.configSavedMessage)
  }

  const getBookShelf = async (): ApiResult<Book[]> => {
    const books = await getAllBooks()
    return ok(
      books.sort((left, right) => right.durChapterTime - left.durChapterTime),
    )
  }

  const getChapterList = async (bookUrl: string): ApiResult<BookChapter[]> => {
    const chapters = await getChapterRecords(bookUrl)
    return chapters.length === 0
      ? fail('这本书还没有章节，请重新导入')
      : ok(
          chapters.map(({ url, title, bookUrl: chapterBookUrl, index }) => ({
            url,
            title,
            bookUrl: chapterBookUrl,
            index,
          })),
        )
  }

  const getBookContent = async (
    bookUrl: string,
    index: number,
  ): ApiResult<string> => {
    const chapter = (await getChapterRecords(bookUrl)).find(
      item => item.index === index,
    )
    return chapter === undefined
      ? fail('章节不存在或已被删除')
      : ok(chapter.content)
  }

  const getContentFilterRules = async (
    bookUrl: string,
  ): ApiResult<ContentFilterRule[]> => ok(await storage.readFilters(bookUrl))

  const saveContentFilterRules = async (
    bookUrl: string,
    rules: ContentFilterRule[],
  ): ApiResult<ContentFilterRule[]> => {
    const normalizedRules = normalizeContentFilterRules(rules)
    await storage.writeFilters(bookUrl, normalizedRules)
    return ok(normalizedRules)
  }

  const deleteContentFilterRules = async (
    bookUrl: string,
  ): ApiResult<string> => {
    await storage.writeFilters(bookUrl, [])
    return ok('书籍过滤规则已删除')
  }

  const saveBookProgress = async (
    progress: BookProgress,
  ): ApiResult<string> => {
    const book = await getBook(progress.bookUrl)
    if (book === undefined) return ok('没有需要保存的本地进度')
    await storage.updateBook({ ...book, ...progress })
    return ok('阅读进度已保存到本地')
  }

  const importLocalTextBook = async (
    file: File | LocalTextFile,
  ): ApiResult<Book> => {
    if (!file.name.toLocaleLowerCase().endsWith('.txt')) {
      return fail('当前版本仅支持导入 TXT 文本书籍')
    }
    const { text, bytes } = await readTextFile(file)
    const parsedChapters = parseTextChapters(text)
    const book = buildBook(file, parsedChapters)
    const chapters = parsedChapters.map(
      (chapter, index): ChapterRecord => ({
        url: book.bookUrl + '/chapter/' + index,
        title: chapter.title,
        bookUrl: book.bookUrl,
        index,
        content: chapter.content,
      }),
    )
    await storage.saveBook(book, chapters, bytes)
    return ok(book)
  }

  const deleteBook = async (book: BaseBook): ApiResult<string> => {
    await storage.deleteBook(book.bookUrl)
    return ok('书籍已从本地书架删除')
  }

  const clearLocalData = async (): ApiResult<string> => {
    try {
      await storage.clear()
      return ok(storage.clearMessage)
    } catch (error) {
      return fail(error instanceof Error ? error.message : '清空本地数据失败')
    }
  }

  const readLocalTextFiles = (paths: string[]) => {
    if (storage.readTextFiles === undefined) {
      return Promise.reject(new Error('网站版请通过文件选择或拖放导入 TXT'))
    }
    return storage.readTextFiles(paths)
  }

  return {
    getReadConfig,
    saveReadConfig,
    saveBookProgress,
    getBookShelf,
    getChapterList,
    getBookContent,
    getContentFilterRules,
    saveContentFilterRules,
    deleteContentFilterRules,
    importLocalTextBook,
    readLocalTextFiles,
    getReadingRecent: () => storage.readRecent(),
    saveReadingRecent: (recent: ReadingRecentBook) =>
      storage.writeRecent(recent),
    clearReadingRecent: () => storage.writeRecent(null),
    deleteBook,
    clearLocalData,
  }
}
