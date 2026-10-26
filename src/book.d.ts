export type BaseBook = {
  name: string
  author: string
  bookUrl: string
  kind?: string
  wordCount?: string
  variable?: string
}

export type Book = BaseBook & {
  tocUrl: string
  origin: string
  originName: string
  customTag?: string
  coverUrl?: string
  customCoverUrl?: string
  intro?: string
  customIntro?: string
  charset?: string
  type: number
  group: number
  latestChapterTitle?: string
  latestChapterTime: number
  lastCheckTime: number
  lastCheckCount: number
  totalChapterNum: number
  durChapterTitle?: string
  durChapterIndex: number
  durChapterPos: number
  durChapterTime: number
  canUpdate: boolean
  order: number
  originOrder: number
  readConfig?: ReadConfig
  syncTime: number
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
  isVolume: boolean
  baseUrl: string
  bookUrl: string
  index: number
  isVip: boolean
  isPay: boolean
  resourceUrl?: string
  tag?: string
  start?: number
  end?: number
  startFragmentId?: string
  endFragmentId?: string
  variable?: string
}
