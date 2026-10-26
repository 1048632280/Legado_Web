<template>
  <aside class="navigation-wrapper">
    <div class="navigation-title-wrapper">
      <div class="navigation-title">阅读</div>
      <div class="navigation-sub-title">本地 TXT 阅读器</div>
    </div>
    <el-input
      v-model="searchModel"
      class="search-input"
      placeholder="筛选本地书架"
      :prefix-icon="SearchIcon"
      aria-label="筛选本地书架"
    />
    <div class="recent-wrapper">
      <div class="section-title">最近阅读</div>
      <button
        type="button"
        class="recent-book"
        :disabled="!hasReadingRecent"
        @click="emit('recentClick')"
      >
        {{ readingRecent.name }}
      </button>
    </div>
    <div class="setting-wrapper">
      <div class="section-title">本地数据</div>
      <div class="setting-item">
        <el-button size="small" @click="emit('importTxt')">导入 TXT</el-button>
        <el-button type="danger" size="small" @click="emit('clearData')">清空数据</el-button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Search as SearchIcon } from '@element-plus/icons-vue'
import type { ReadingRecentBook } from '@/utils/bookshelf'

const props = defineProps<{
  searchWord: string
  readingRecent: ReadingRecentBook
}>()

const emit = defineEmits<{
  'update:searchWord': [value: string]
  recentClick: []
  importTxt: []
  clearData: []
}>()

const searchModel = computed({
  get: () => props.searchWord,
  set: (value: string) => emit('update:searchWord', value),
})
const hasReadingRecent = computed(() => props.readingRecent.bookUrl !== '')
</script>

<style lang="scss" scoped>
.navigation-wrapper {
  display: flex;
  flex: 0 0 272px;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  padding: 40px 28px 32px;
  overflow-y: auto;
  border-right: 1px solid var(--shelf-panel-border);
  background: var(--shelf-sidebar-bg);
}

.navigation-title {
  color: var(--shelf-text);
  font-family: FZZCYSK;
  font-size: 24px;
  font-weight: 700;
}

.navigation-sub-title,
.section-title {
  color: var(--shelf-muted);
}

.navigation-sub-title {
  margin-top: 12px;
  font-size: 14px;
}

.search-input {
  margin-top: 22px;
}

.recent-wrapper,
.setting-wrapper {
  margin-top: 30px;
}

.section-title {
  font-size: 14px;
}

.recent-book,
.setting-item :deep(.el-button) {
  width: 100%;
  margin: 0;
}

.recent-book {
  min-height: 36px;
  margin-top: 12px;
  padding: 8px 12px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 10px;
  color: var(--el-color-primary);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-book:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.setting-item {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

@media screen and (max-width: 750px) {
  .navigation-wrapper {
    flex-basis: auto;
    min-height: auto;
    padding: 16px;
    border-right: 0;
    border-bottom: 1px solid var(--shelf-panel-border);
  }

  .setting-item {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
