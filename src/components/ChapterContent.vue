<template>
  <div ref="titleRef" class="title" data-chapterpos="0">{{ title }}</div>
  <p
    v-for="(paragraph, index) in contents"
    :key="index"
    ref="paragraphRef"
    :data-chapterpos="chapterPos[index]"
    :style="{ fontFamily, fontSize }"
  >
    {{ paragraph }}
  </p>
</template>

<script setup lang="ts">
import jump from '@/plugins/jump'
import type { webReadConfig } from '@/web'

const props = defineProps<{
  chapterIndex: number
  contents: string[]
  title: string
  spacing: webReadConfig['spacing']
  fontFamily: string
  fontSize: string
}>()

const chapterPos = computed(() => {
  let position = -1
  return props.contents.map(content => {
    position += content.length + 1
    return position
  })
})

const titleRef = ref<HTMLElement>()
const paragraphRef = ref<HTMLParagraphElement[]>()
const scrollToReadLength = (length: number) => {
  if (length === 0) return
  const index = chapterPos.value.findIndex(position => position >= length)
  if (index === -1) return
  const paragraph = paragraphRef.value?.[index]
  if (paragraph === undefined) return
  nextTick(() => jump(paragraph, { duration: 0 }))
}
defineExpose({ scrollToReadLength })

const emit = defineEmits<{
  readLengthChange: [index: number, position: number]
}>()
let observer: IntersectionObserver | undefined

const observeReadingProgress = () => {
  observer?.disconnect()
  observer = new IntersectionObserver(
    entries => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) {
          emit(
            'readLengthChange',
            props.chapterIndex,
            Number((target as HTMLElement).dataset.chapterpos ?? 0),
          )
        }
      })
    },
    { rootMargin: `0px 0px -${window.innerHeight - 24}px 0px` },
  )
  if (titleRef.value === undefined) return
  observer.observe(titleRef.value)
  paragraphRef.value?.forEach(paragraph => observer?.observe(paragraph))
}

onMounted(() => {
  observeReadingProgress()
})

watch(
  () => props.contents,
  () => {
    void nextTick(observeReadingProgress)
  },
  { flush: 'post' },
)

onUnmounted(() => observer?.disconnect())
</script>

<style lang="scss" scoped>
.title {
  margin-bottom: 57px;
  font:
    24px / 32px PingFangSC-Regular,
    HelveticaNeue-Light,
    'Helvetica Neue Light',
    'Microsoft YaHei',
    sans-serif;
}

p {
  display: block;
  margin: calc(v-bind('props.spacing.paragraph') * 1em) 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  letter-spacing: calc(v-bind('props.spacing.letter') * 1em);
  line-height: calc(1 + v-bind('props.spacing.line'));
}
</style>
