<template>
  <div class="filter-panel" :class="{ night: isNight, day: !isNight }">
    <div class="filter-title">内容过滤</div>
    <div class="filter-form">
      <label class="filter-field">
        <span>过滤内容</span>
        <textarea
          v-model="search"
          rows="3"
          placeholder="输入要过滤的内容"
        />
      </label>
      <label class="filter-field">
        <span>替换内容</span>
        <textarea
          v-model="replacement"
          rows="3"
          placeholder="留空表示直接删除"
        />
      </label>
      <el-button
        class="add-button"
        type="primary"
        :loading="isSaving"
        @click="addRule"
      >
        <el-icon><Plus /></el-icon>
        <span>添加规则</span>
      </el-button>
    </div>

    <div class="rules-title">已有规则</div>
    <div v-if="isLoading" class="rules-message">正在读取规则</div>
    <div v-else-if="rules.length === 0" class="rules-message">
      暂无过滤规则
    </div>
    <div v-else class="rules-list">
      <div v-for="rule in rules" :key="rule.id" class="rule-item">
        <div class="rule-values">
          <div class="rule-value">
            <span class="rule-label">过滤</span>
            <span class="rule-text">{{ rule.search }}</span>
          </div>
          <div class="rule-value">
            <span class="rule-label">替换</span>
            <span class="rule-text">{{ rule.replacement || '删除' }}</span>
          </div>
        </div>
        <el-button text type="danger" size="small" @click="deleteRule(rule.id)">
          <el-icon><Delete /></el-icon>
          <span>删除</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { ContentFilterRule } from '@/utils/contentFilter'

defineProps<{
  isNight: boolean
  rules: ContentFilterRule[]
  isLoading: boolean
  isSaving: boolean
}>()

const emit = defineEmits<{
  addRule: [search: string, replacement: string]
  deleteRule: [id: string]
}>()

const search = ref('')
const replacement = ref('')

const addRule = () => {
  if (search.value.length === 0) {
    ElMessage.warning('请输入要过滤的内容')
    return
  }
  emit('addRule', search.value, replacement.value)
  search.value = ''
  replacement.value = ''
}

const deleteRule = (id: string) => emit('deleteRule', id)
</script>

<style lang="scss" scoped>
.filter-panel {
  min-width: 270px;
  padding: 18px 22px;
  color: #333;
}

.filter-title,
.rules-title {
  color: #ed4259;
  font-size: 18px;
}

.rules-title {
  margin-top: 20px;
  margin-bottom: 10px;
  font-size: 15px;
}

.filter-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.filter-field {
  display: flex;
  align-items: flex-start;
  gap: 10px;

  span {
    flex: 0 0 58px;
    padding-top: 7px;
    font-size: 12px;
  }

  textarea {
    box-sizing: border-box;
    flex: 1;
    min-width: 0;
    padding: 7px 9px;
    resize: vertical;
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: 2px;
    color: inherit;
    background: rgba(255, 255, 255, 0.5);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    outline: none;

    &:focus {
      border-color: #ed4259;
    }
  }
}

.add-button {
  align-self: flex-end;
}

.rules-message {
  padding: 12px 0;
  color: #999;
  font-size: 13px;
}

.rules-list {
  max-height: 35vh;
  overflow: auto;
}

.rule-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.rule-values {
  min-width: 0;
  flex: 1;
}

.rule-value {
  display: flex;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.6;
}

.rule-label {
  flex: 0 0 28px;
  color: #999;
}

.rule-text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.night {
  color: #d7dbe0;

  .filter-field textarea {
    border-color: #666;
    background: rgba(45, 45, 45, 0.5);
  }

  .rule-item {
    border-top-color: #666;
  }
}

@media screen and (max-width: 500px) {
  .filter-panel {
    padding: 14px;
  }

  .filter-field {
    flex-direction: column;
    gap: 4px;

    span {
      padding-top: 0;
    }

    textarea {
      width: 100%;
    }
  }
}
</style>
