import type { Book } from '@/book'
import type { webReadConfig } from '@/web'
import type { ContentFilterRule } from '@/utils/contentFilter'
import type { ReadingRecentBook } from '@/utils/bookshelf'
import {
  type ChapterRecord,
  createLocalReaderApi,
  type LocalReaderStorage,
} from './localReader'

type BrowserBookRecord = {
  bookUrl: string
  book: Book
  chapters: ChapterRecord[]
  source: Uint8Array
}

type SettingRecord<T> = { key: string; value: T }

const databaseName = 'legado-web-reader'
let databasePromise: Promise<IDBDatabase> | undefined

const openDatabase = () => {
  if (databasePromise !== undefined) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      database.createObjectStore('books', { keyPath: 'bookUrl' })
      database.createObjectStore('settings', { keyPath: 'key' })
      database.createObjectStore('filters', { keyPath: 'bookUrl' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      databasePromise = undefined
      reject(request.error ?? new Error('无法打开浏览器本地数据库'))
    }
  })
  return databasePromise
}

const requestTransaction = async <T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  createRequest: (transaction: IDBTransaction) => IDBRequest<T>,
) => {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode)
    const request = createRequest(transaction)
    let result: T
    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () =>
      reject(request.error ?? new Error('读取浏览器本地数据失败'))
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('保存浏览器本地数据失败'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('浏览器本地数据操作已取消'))
  })
}

const readSetting = async <T>(key: string): Promise<T | null> => {
  const setting = await requestTransaction<SettingRecord<T> | undefined>(
    ['settings'],
    'readonly',
    transaction => transaction.objectStore('settings').get(key),
  )
  return setting?.value ?? null
}

const browserStorage: LocalReaderStorage = {
  dataDescription: '当前浏览器的 IndexedDB',
  configSavedMessage: '阅读配置已保存在当前浏览器',
  clearMessage: '当前浏览器中的书籍、章节和设置已清空',
  listBooks: async () => {
    const records = await requestTransaction<BrowserBookRecord[]>(
      ['books'],
      'readonly',
      transaction => transaction.objectStore('books').getAll(),
    )
    return records.map(record => record.book)
  },
  readBook: async bookUrl => {
    const record = await requestTransaction<BrowserBookRecord | undefined>(
      ['books'],
      'readonly',
      transaction => transaction.objectStore('books').get(bookUrl),
    )
    if (record === undefined) return undefined
    return { book: record.book, chapters: record.chapters }
  },
  saveBook: async (book, chapters, source) => {
    await requestTransaction<IDBValidKey>(['books'], 'readwrite', transaction =>
      transaction.objectStore('books').put({
        bookUrl: book.bookUrl,
        book,
        chapters,
        source: Uint8Array.from(source),
      } satisfies BrowserBookRecord),
    )
  },
  updateBook: async book => {
    const record = await requestTransaction<BrowserBookRecord | undefined>(
      ['books'],
      'readonly',
      transaction => transaction.objectStore('books').get(book.bookUrl),
    )
    if (record === undefined) return
    await requestTransaction<IDBValidKey>(['books'], 'readwrite', transaction =>
      transaction.objectStore('books').put({ ...record, book }),
    )
  },
  deleteBook: async bookUrl => {
    await requestTransaction<undefined>(
      ['books', 'filters'],
      'readwrite',
      transaction => {
        transaction.objectStore('filters').delete(bookUrl)
        return transaction.objectStore('books').delete(bookUrl)
      },
    )
  },
  readConfig: () => readSetting<webReadConfig>('readConfig'),
  writeConfig: async config => {
    await requestTransaction<IDBValidKey>(
      ['settings'],
      'readwrite',
      transaction =>
        transaction
          .objectStore('settings')
          .put({ key: 'readConfig', value: config }),
    )
  },
  readRecent: () => readSetting<ReadingRecentBook | null>('readingRecent'),
  writeRecent: async recent => {
    if (recent === null) {
      await requestTransaction<undefined>(
        ['settings'],
        'readwrite',
        transaction =>
          transaction.objectStore('settings').delete('readingRecent'),
      )
      return
    }
    await requestTransaction<IDBValidKey>(
      ['settings'],
      'readwrite',
      transaction =>
        transaction
          .objectStore('settings')
          .put({ key: 'readingRecent', value: recent }),
    )
  },
  readFilters: async bookUrl => {
    const record = await requestTransaction<
      { bookUrl: string; rules: ContentFilterRule[] } | undefined
    >(['filters'], 'readonly', transaction =>
      transaction.objectStore('filters').get(bookUrl),
    )
    return record?.rules ?? []
  },
  writeFilters: async (bookUrl, rules) => {
    if (rules.length === 0) {
      await requestTransaction<undefined>(
        ['filters'],
        'readwrite',
        transaction => transaction.objectStore('filters').delete(bookUrl),
      )
      return
    }
    await requestTransaction<IDBValidKey>(
      ['filters'],
      'readwrite',
      transaction => transaction.objectStore('filters').put({ bookUrl, rules }),
    )
  },
  clear: async () => {
    await requestTransaction<undefined>(
      ['books', 'settings', 'filters'],
      'readwrite',
      transaction => {
        transaction.objectStore('books').clear()
        transaction.objectStore('settings').clear()
        return transaction.objectStore('filters').clear()
      },
    )
  },
}

export const storageDescription = browserStorage.dataDescription
export const isDesktopBuild = false
export default createLocalReaderApi(browserStorage)
