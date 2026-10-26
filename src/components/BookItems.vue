<template>
  <div class="books-wrapper">
    <div class="wrapper">
      <div
        v-for="book in books"
        :key="book.bookUrl"
        class="book"
        role="button"
        tabindex="0"
        :aria-label="`打开《${book.name}》`"
        @click="emit('bookClick', book)"
        @keydown.enter.prevent="emit('bookClick', book)"
        @keydown.space.prevent="emit('bookClick', book)"
      >
        <div class="cover-img">
          <img class="cover" :src="getPlaceholderCover(book)" :alt="`${book.name} 封面`" />
        </div>
        <div class="info">
          <div class="name" :title="book.name">{{ book.name }}</div>
          <div class="sub">
            <span class="author" :title="book.author">{{ book.author || '作者未知' }}</span>
            <span class="dot">-</span>
            <span>共 {{ book.totalChapterNum }} 章</span>
            <span class="dot">-</span>
            <span>{{ dateFormat(book.lastCheckTime) }}</span>
          </div>
          <div class="chapter">已读：{{ book.durChapterTitle }}</div>
          <div v-if="book.latestChapterTitle" class="chapter">最新：{{ book.latestChapterTitle }}</div>
          <el-button
            class="delete-book"
            text
            type="danger"
            size="small"
            @click.stop="emit('bookDelete', book)"
            @keydown.enter.stop
            @keydown.space.stop
          >
            删除
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Book } from '@/book'
import { getPlaceholderCover } from '@/utils/bookCover'
import { dateFormat } from '@/utils/utils'

defineProps<{ books: Book[] }>()
const emit = defineEmits<{
  bookClick: [book: Book]
  bookDelete: [book: Book]
}>()
</script>

<style lang="scss" scoped>
.books-wrapper {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.wrapper {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 292px), 340px));
  gap: var(--shelf-grid-gap, 16px);
  align-content: start;
}

.book {
  display: flex;
  gap: 16px;
  min-width: 0;
  padding: 16px;
  cursor: pointer;
  border: 1px solid var(--shelf-panel-border, #ebeef5);
  border-radius: var(--shelf-radius, 16px);
  background: var(--shelf-card-bg, #fff);
  box-shadow: var(--shelf-card-shadow);

  &:hover,
  &:focus-visible {
    border-color: rgba(64, 158, 255, 0.36);
    background: var(--shelf-card-hover-bg, #fff);
    box-shadow: var(--shelf-card-hover-shadow);
  }
}

.cover-img,
.cover {
  flex: 0 0 auto;
  width: 80px;
  height: 112px;
  border-radius: 11px;
}

.cover {
  display: block;
  object-fit: cover;
}

.info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
}

.name,
.sub,
.chapter {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  font-size: 16px;
  font-weight: 700;
}

.sub,
.chapter {
  color: var(--shelf-muted, #606975);
  font-size: 12px;
}

.dot {
  padding: 0 5px;
}

.delete-book {
  align-self: flex-start;
  margin-top: auto;
}

@media screen and (max-width: 750px) {
  .wrapper {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .book {
    padding: 12px;
  }
}
</style>
