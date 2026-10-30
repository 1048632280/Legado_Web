export type BaseBook = {
  name: string
  author: string
  bookUrl: string
}

export type Book = BaseBook & {
  latestChapterTitle?: string
  lastCheckTime: number
  totalChapterNum: number
  durChapterTitle?: string
  durChapterIndex: number
  durChapterPos: number
  durChapterTime: number
}

export type BookProgress = Pick<
  Book,
  | 'name'
  | 'author'
  | 'bookUrl'
  | 'durChapterIndex'
  | 'durChapterPos'
  | 'durChapterTime'
  | 'durChapterTitle'
>

export type BookChapter = {
  url: string
  title: string
  bookUrl: string
  index: number
}
