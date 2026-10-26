import { ref, unref, watch, type MaybeRef } from 'vue'
import API from '@api'
import {
  createContentFilterRuleId,
  normalizeContentFilterRule,
  type ContentFilterRule,
} from '@/utils/contentFilter'

export const useContentFilters = (bookUrl: MaybeRef<string>) => {
  const rules = ref<ContentFilterRule[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const errorMessage = ref('')
  let loadRequestId = 0

  const loadRules = async (targetBookUrl: string) => {
    const requestId = ++loadRequestId
    rules.value = []
    errorMessage.value = ''
    if (targetBookUrl.length === 0) return

    isLoading.value = true
    try {
      const result = await API.getContentFilterRules(targetBookUrl)
      if (requestId !== loadRequestId) return
      if (!result.data.isSuccess) {
        errorMessage.value = result.data.errorMsg
        return
      }
      rules.value = result.data.data
    } catch (error) {
      if (requestId !== loadRequestId) return
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      if (requestId === loadRequestId) isLoading.value = false
    }
  }

  watch(
    () => unref(bookUrl),
    targetBookUrl => {
      void loadRules(targetBookUrl)
    },
    { immediate: true },
  )

  const saveRules = async (nextRules: ContentFilterRule[]) => {
    const targetBookUrl = unref(bookUrl)
    if (targetBookUrl.length === 0) return false

    isSaving.value = true
    errorMessage.value = ''
    try {
      const result = await API.saveContentFilterRules(targetBookUrl, nextRules)
      if (!result.data.isSuccess) {
        errorMessage.value = result.data.errorMsg
        return false
      }
      if (targetBookUrl === unref(bookUrl)) rules.value = result.data.data
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      isSaving.value = false
    }
  }

  const addRule = async (search: string, replacement: string) => {
    const rule = normalizeContentFilterRule({
      id: createContentFilterRuleId(),
      search,
      replacement,
    })
    if (rule === undefined) return false
    return saveRules([...rules.value, rule])
  }

  const deleteRule = async (id: string) => {
    const nextRules = rules.value.filter(rule => rule.id !== id)
    return saveRules(nextRules)
  }

  return {
    rules,
    isLoading,
    isSaving,
    errorMessage,
    addRule,
    deleteRule,
  }
}
