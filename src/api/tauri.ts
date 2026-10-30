import { invoke } from '@tauri-apps/api/core'
import type { Book } from '@/book'
import type { webReadConfig } from '@/web'
import type { ContentFilterRule } from '@/utils/contentFilter'
import type { ReadingRecentBook } from '@/utils/bookshelf'
import {
  createLocalReaderApi,
  type ChapterRecord,
  type LocalReaderStorage,
  type LocalTextFile,
} from './localReader'

const invokeLocal = <T>(command: string, args?: Record<string, unknown>) =>
  invoke<T>(command, args)

const tauriStorage: LocalReaderStorage = {
  dataDescription: '安装目录下的 data 文件夹',
  configSavedMessage: '阅读配置已保存到本地 data 目录',
  clearMessage: '本地 data 目录已清空',
  listBooks: () => invokeLocal<Book[]>('list_local_books'),
  readBook: bookUrl =>
    invokeLocal<{ book: Book; chapters: ChapterRecord[] }>('read_local_book', {
      bookUrl,
    }),
  saveBook: (book, chapters, source) =>
    invokeLocal('save_local_book', {
      book,
      chapters,
      source: Array.from(source),
    }),
  updateBook: book => invokeLocal('update_local_book', { book }),
  deleteBook: bookUrl => invokeLocal('delete_local_book', { bookUrl }),
  readConfig: () => invokeLocal<webReadConfig | null>('read_local_config'),
  writeConfig: config => invokeLocal('write_local_config', { config }),
  readRecent: () => invokeLocal<ReadingRecentBook | null>('read_local_recent'),
  writeRecent: recent => invokeLocal('write_local_recent', { recent }),
  readFilters: bookUrl =>
    invokeLocal<ContentFilterRule[]>('read_local_filters', { bookUrl }),
  writeFilters: (bookUrl, rules) =>
    invokeLocal('write_local_filters', { bookUrl, rules }),
  clear: () => invokeLocal('clear_local_data'),
  readTextFiles: paths =>
    invokeLocal<LocalTextFile[]>('read_local_text_files', { paths }),
}

export const storageDescription = tauriStorage.dataDescription
export const isDesktopBuild = true
export default createLocalReaderApi(tauriStorage)
