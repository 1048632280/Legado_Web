import API from '@api'
import type { LocalTextFile } from '@/api/standalone'
import type { webReadConfig } from '@/web'
import {
  clearReadingSession,
  getErrorMessage,
  hasDragFiles,
  isTextFile,
} from '@/utils/bookshelf'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { onMounted, onUnmounted, ref } from 'vue'

type UseStandaloneBookImportOptions = {
  loadingWrapper: (promise: Promise<unknown>) => Promise<unknown>
  reloadShelf: () => Promise<unknown>
  setReadConfig: (config?: webReadConfig) => void
  resetReadingRecent: () => void
}

export const useStandaloneBookImport = ({
  loadingWrapper,
  reloadShelf,
  setReadConfig,
  resetReadingRecent,
}: UseStandaloneBookImportOptions) => {
  const fileInput = ref<HTMLInputElement>()
  const isDraggingFile = ref(false)
  const dragDepth = ref(0)
  const nativeDragActive = ref(false)
  let skipNextDomDrop = false
  let stopNativeDrag: (() => void) | undefined

  const importFiles = async (files: Array<File | LocalTextFile>) => {
    if (files.length === 0) return

    const textFiles = files.filter(isTextFile)
    if (textFiles.length === 0) {
      ElMessage.warning('请导入 TXT 文件')
      return
    }
    if (textFiles.length !== files.length) {
      ElMessage.warning('已忽略非 TXT 文件')
    }

    let importedCount = 0
    await loadingWrapper(
      Promise.allSettled(
        textFiles.map(file => API.importLocalTextBook(file)),
      ).then(results => {
        const successBooks: string[] = []
        const failedMessages: string[] = []

        results.forEach(result => {
          if (result.status === 'rejected') {
            failedMessages.push(getErrorMessage(result.reason))
            return
          }
          if (result.value.data.isSuccess) {
            successBooks.push(result.value.data.data.name)
          } else {
            failedMessages.push(result.value.data.errorMsg)
          }
        })

        importedCount = successBooks.length
        if (successBooks.length > 0) {
          ElMessage.success(`已导入：${successBooks.join('、')}`)
        }
        if (failedMessages.length > 0) {
          ElMessage.error(failedMessages.join('；'))
        }
      }),
    )
    if (importedCount > 0) await reloadShelf()
  }

  const importTextFiles = async (files: File[]) => importFiles(files)

  const importLocalPaths = async (paths: string[]) => {
    try {
      const files = await API.readLocalTextFiles(paths)
      await importFiles(files)
    } catch (error) {
      ElMessage.error(`读取拖入内容失败：${getErrorMessage(error)}`)
    }
  }

  const importLocalBooks = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ''
    await importTextFiles(files)
  }

  const handleShelfDragEnter = (event: DragEvent) => {
    if (!hasDragFiles(event)) return
    event.preventDefault()
    dragDepth.value += 1
    isDraggingFile.value = true
  }

  const handleShelfDragOver = (event: DragEvent) => {
    if (!hasDragFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy'
    isDraggingFile.value = true
  }

  const handleShelfDragLeave = (event: DragEvent) => {
    if (!hasDragFiles(event)) return
    event.preventDefault()
    dragDepth.value = Math.max(0, dragDepth.value - 1)
    isDraggingFile.value = dragDepth.value > 0
  }

  const handleShelfDrop = async (event: DragEvent) => {
    if (!hasDragFiles(event)) return
    event.preventDefault()
    if (nativeDragActive.value || skipNextDomDrop) {
      skipNextDomDrop = false
      return
    }
    dragDepth.value = 0
    isDraggingFile.value = false
    await importTextFiles(Array.from(event.dataTransfer?.files ?? []))
  }

  const setupNativeDrag = async () => {
    try {
      stopNativeDrag = await getCurrentWindow().onDragDropEvent(event => {
        const payload = event.payload
        if (payload.type === 'enter') {
          nativeDragActive.value = true
          isDraggingFile.value = true
          return
        }
        if (payload.type === 'over') {
          nativeDragActive.value = true
          isDraggingFile.value = true
          return
        }
        if (payload.type === 'leave') {
          nativeDragActive.value = false
          isDraggingFile.value = false
          return
        }

        nativeDragActive.value = false
        isDraggingFile.value = false
        skipNextDomDrop = true
        window.setTimeout(() => {
          skipNextDomDrop = false
        }, 500)
        void importLocalPaths(payload.paths)
      })
    } catch {
      // 浏览器开发模式没有 Tauri 原生拖放事件，继续使用 DOM 拖放。
    }
  }

  onMounted(() => {
    void setupNativeDrag()
  })

  onUnmounted(() => {
    stopNativeDrag?.()
  })

  const clearStandaloneData = async () => {
    try {
      await ElMessageBox.confirm(
        '此操作会删除 data 文件夹中的书籍、章节、进度和阅读设置。确定继续？',
        '清空数据',
        {
          confirmButtonText: '清空',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    } catch {
      return
    }

    try {
      const result = await API.clearStandaloneData()
      if (!result.data.isSuccess) {
        ElMessage.error(result.data.errorMsg)
        return
      }

      resetReadingRecent()
      clearReadingSession()
      setReadConfig(await API.getReadConfig())
      await reloadShelf()
      ElMessage.success(result.data.data)
    } catch (error) {
      ElMessage.error(`清空数据失败：${getErrorMessage(error)}`)
    }
  }

  return {
    fileInput,
    isDraggingFile,
    importTextFiles,
    importLocalBooks,
    handleShelfDragEnter,
    handleShelfDragOver,
    handleShelfDragLeave,
    handleShelfDrop,
    clearStandaloneData,
  }
}
