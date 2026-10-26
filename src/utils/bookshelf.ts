import type { Book } from '@/book'

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export type ReadingRecentBook = {
  name: string
  author: string
  bookUrl: string
  chapterIndex: number
  chapterPos: number
}

const READING_SESSION_KEYS = [
  'bookUrl',
  'bookName',
  'bookAuthor',
  'chapterIndex',
  'chapterPos',
]

export const createDefaultReadingRecent = (): ReadingRecentBook => ({
  name: '尚无阅读记录',
  author: '',
  bookUrl: '',
  chapterIndex: 0,
  chapterPos: 0,
})

export const saveReadingSession = (recent: ReadingRecentBook) => {
  sessionStorage.setItem('bookUrl', recent.bookUrl)
  sessionStorage.setItem('bookName', recent.name)
  sessionStorage.setItem('bookAuthor', recent.author)
  sessionStorage.setItem('chapterIndex', String(recent.chapterIndex))
  sessionStorage.setItem('chapterPos', String(recent.chapterPos))
}

export const clearReadingSession = () => {
  READING_SESSION_KEYS.forEach(key => sessionStorage.removeItem(key))
}

export const normalizeSearchText = (value: string) =>
  value.trim().toLocaleLowerCase()

export const filterShelfBooks = (books: Book[], keyword: string) => {
  const key = normalizeSearchText(keyword)
  if (key.length === 0) return books

  return books.filter(book => {
    const text =
      `${book.name} ${book.author} ${book.kind ?? ''}`.toLocaleLowerCase()
    return text.includes(key)
  })
}

export const hasBookOnShelf = (books: Book[], bookUrl: string) =>
  books.some(book => book.bookUrl === bookUrl)

export const getBookReadPosition = (book: Book) => ({
  chapterIndex: book.durChapterIndex,
  chapterPos: book.durChapterPos,
})

export const isTextFile = (file: { name: string; type?: string }) =>
  file.name.toLocaleLowerCase().endsWith('.txt') || file.type === 'text/plain'

export const hasDragFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files')
