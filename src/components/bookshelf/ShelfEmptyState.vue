<template>
  <section class="empty-shelf-state">
    <div class="empty-shelf-title">导入 TXT 开始阅读</div>
    <div class="empty-shelf-description">选择本地 TXT 文件，或直接拖拽到书架区域导入。</div>
    <el-button type="primary" size="large" @click="emit('importTxt')">导入 TXT</el-button>
  </section>
</template>

<script setup lang="ts">
const emit = defineEmits<{ importTxt: [] }>()
</script>

<style lang="scss" scoped>
.empty-shelf-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  padding: 32px;
  border: 1px dashed var(--shelf-panel-border);
  border-radius: 18px;
  text-align: center;
  background: var(--shelf-panel-bg);
}

.empty-shelf-title {
  font-size: 22px;
  font-weight: 700;
}

.empty-shelf-description {
  margin: 14px 0 24px;
  color: var(--shelf-muted);
}
</style>
