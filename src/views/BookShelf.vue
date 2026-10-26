<template>
  <div :class="{ 'index-wrapper': true, night: isNight, day: !isNight }">
    <shelf-sidebar
      v-model:search-word="searchWord"
      :reading-recent="readingRecent"
      @recent-click="openReadingRecent"
      @import-txt="fileInput?.click()"
      @clear-data="clearStandaloneData"
    />
    <input
      ref="fileInput"
      class="hidden-file-input"
      type="file"
      accept=".txt,text/plain"
      multiple
      @change="importLocalBooks"
    />
    <div
      ref="shelfWrapper"
      class="shelf-wrapper"
      :class="{ 'drag-over': isDraggingFile }"
      @dragenter="handleShelfDragEnter"
      @dragover="handleShelfDragOver"
      @dragleave="handleShelfDragLeave"
      @drop="handleShelfDrop"
    >
      <shelf-empty-state v-if="showEmptyState" @import-txt="fileInput?.click()" />
      <div v-else-if="showSearchEmptyState" class="shelf-empty-message">
        本地书架没有匹配「{{ searchWord.trim() }}」的书籍。
      </div>
      <book-items
        v-else
        :books="books"
        @book-click="handleBookClick"
        @book-delete="handleBookDelete"
      />
      <drag-import-mask v-if="isDraggingFile" description="释放鼠标导入 TXT" />
    </div>
  </div>
</template>

<script setup lang="ts">
import '@/assets/bookshelf.css'
import '@/assets/fonts/shelffont.css'
import DragImportMask from '@/components/bookshelf/DragImportMask.vue'
import ShelfEmptyState from '@/components/bookshelf/ShelfEmptyState.vue'
import ShelfSidebar from '@/components/bookshelf/ShelfSidebar.vue'
import { useBookStore } from '@/store'
import { useLoading } from '@/hooks/loading'
import { useStandaloneBookImport } from '@/hooks/useStandaloneBookImport'
import type { Book } from '@/book'
import {
  type ReadingRecentBook,
  clearReadingSession,
  createDefaultReadingRecent,
  filterShelfBooks,
  getBookReadPosition,
  getErrorMessage,
  hasBookOnShelf,
  saveReadingSession,
} from '@/utils/bookshelf'
import API from '@api'

const store = useBookStore()
const router = useRouter()
const isNight = computed(() => store.isNight)
const shelf = computed(() => store.shelf)
const searchWord = ref('')
const readingRecent = ref<ReadingRecentBook>(createDefaultReadingRecent())
const shelfWrapper = ref<HTMLElement>()
const { loadingWrapper, isLoading } = useLoading(shelfWrapper, '正在读取本地书架')

const books = computed(() =>
  searchWord.value.trim() === ''
    ? shelf.value
    : filterShelfBooks(shelf.value, searchWord.value),
)
const showEmptyState = computed(() => !isLoading.value && shelf.value.length === 0)
const showSearchEmptyState = computed(
  () => searchWord.value.trim() !== '' && books.value.length === 0,
)

const resetReadingRecent = () => {
  readingRecent.value = createDefaultReadingRecent()
  void API.clearReadingRecent()
}

const {
  fileInput,
  isDraggingFile,
  importLocalBooks,
  handleShelfDragEnter,
  handleShelfDragOver,
  handleShelfDragLeave,
  handleShelfDrop,
  clearStandaloneData,
} = useStandaloneBookImport({
  loadingWrapper,
  reloadShelf: () => store.loadBookShelf(true),
  setReadConfig: config => store.setConfig(config),
  resetReadingRecent,
})

const handleBookDelete = async (book: Book) => {
  try {
    await ElMessageBox.confirm(`确定从本地书架删除《${book.name}》？`, '删除书籍', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const result = await API.deleteBook(book)
    if (!result.data.isSuccess) {
      ElMessage.error(result.data.errorMsg)
      return
    }
    ElMessage.success(result.data.data)
    await store.loadBookShelf(true)
    if (readingRecent.value.bookUrl === book.bookUrl) {
      resetReadingRecent()
      clearReadingSession()
    }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(`删除失败：${getErrorMessage(error)}`)
    }
  }
}

const toDetail = (
  bookUrl: string,
  name: string,
  author: string,
  chapterIndex: number,
  chapterPos: number,
  fromRecent = false,
) => {
  if (fromRecent && !hasBookOnShelf(shelf.value, bookUrl)) {
    ElMessage.warning('最近阅读的书籍已不在书架，请重新导入')
    resetReadingRecent()
    clearReadingSession()
    return
  }
  const recent: ReadingRecentBook = { name, author, bookUrl, chapterIndex, chapterPos }
  readingRecent.value = recent
  void API.saveReadingRecent(recent)
  saveReadingSession(recent)
  router.push({ path: '/chapter' })
}

const handleBookClick = (book: Book) => {
  const { chapterIndex, chapterPos } = getBookReadPosition(book)
  toDetail(book.bookUrl, book.name, book.author, chapterIndex, chapterPos)
}

const openReadingRecent = () => {
  const recent = readingRecent.value
  toDetail(
    recent.bookUrl,
    recent.name,
    recent.author,
    recent.chapterIndex,
    recent.chapterPos,
    true,
  )
}

onMounted(() => {
  void API.getReadingRecent().then(recent => {
    if (recent !== null) readingRecent.value = recent
  })
  void loadingWrapper(
    store.loadWebConfig().then(() => store.loadBookShelf(true)),
  ).catch(error => ElMessage.error(`加载书架失败：${getErrorMessage(error)}`))
})
</script>

<style lang="scss" scoped>
.index-wrapper {
  --shelf-sidebar-bg: #f7f7f7;
  --shelf-main-bg: #f5f7fb;
  --shelf-panel-bg: rgba(255, 255, 255, 0.78);
  --shelf-panel-border: #e5e9f0;
  --shelf-text: #33373d;
  --shelf-muted: #606975;
  --shelf-soft-muted: #8a94a3;
  --shelf-radius: 16px;
  --shelf-page-gutter: clamp(24px, 3vw, 40px);
  --shelf-mobile-gutter: 14px;
  --shelf-grid-gap: 16px;
  --shelf-card-bg: rgba(255, 255, 255, 0.84);
  --shelf-card-hover-bg: rgba(255, 255, 255, 0.96);
  --shelf-card-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  --shelf-card-hover-shadow: 0 18px 34px rgba(15, 23, 42, 0.12);
  --shelf-subpanel-bg: rgba(248, 250, 252, 0.72);
  --shelf-drag-mask-bg: rgba(255, 255, 255, 0.88);
  display: flex;
  width: 100%;
  min-height: 100%;
  color: var(--shelf-text);
  background: var(--shelf-main-bg);

  .hidden-file-input {
    display: none;
  }

  .shelf-wrapper {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    padding: var(--shelf-page-gutter);
    overflow: hidden;
    background: var(--shelf-main-bg);

    &.drag-over {
      outline: 2px dashed rgba(64, 158, 255, 0.45);
      outline-offset: -14px;
    }
  }
}

.shelf-empty-message {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  color: var(--shelf-muted);
}

.night {
  --shelf-sidebar-bg: #202326;
  --shelf-main-bg: #14171a;
  --shelf-panel-bg: rgba(31, 35, 39, 0.78);
  --shelf-panel-border: #343a42;
  --shelf-text: #d7dbe0;
  --shelf-muted: #a0a7b0;
  --shelf-soft-muted: #7f8792;
  --shelf-card-bg: rgba(31, 35, 39, 0.86);
  --shelf-card-hover-bg: rgba(36, 41, 46, 0.96);
  --shelf-card-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
  --shelf-card-hover-shadow: 0 18px 34px rgba(0, 0, 0, 0.32);
  --shelf-subpanel-bg: rgba(17, 24, 39, 0.42);
  --shelf-drag-mask-bg: rgba(22, 24, 25, 0.9);
}

@media screen and (max-width: 750px) {
  .index-wrapper {
    flex-direction: column;

    .shelf-wrapper {
      padding: var(--shelf-mobile-gutter);
      overflow: visible;
    }
  }
}
</style>
