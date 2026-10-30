import { onScopeDispose, ref, type Ref } from 'vue'

export const useAutoRead = (
  speed: Readonly<Ref<number>>,
  onScrollEnd: () => boolean,
) => {
  const isRunning = ref(false)
  let animationFrameId: number | undefined
  let boundaryPollId: number | undefined
  let previousFrameTime: number | undefined
  let targetPosition = 0
  let stalledFrames = 0

  const clearScheduledWork = () => {
    previousFrameTime = undefined
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = undefined
    }
    if (boundaryPollId !== undefined) {
      window.clearTimeout(boundaryPollId)
      boundaryPollId = undefined
    }
  }

  const stop = () => {
    isRunning.value = false
    stalledFrames = 0
    clearScheduledWork()
  }

  const scheduleFrame = () => {
    if (!isRunning.value || document.visibilityState === 'hidden') return
    if (animationFrameId === undefined) {
      animationFrameId = requestAnimationFrame(scrollFrame)
    }
  }

  const scrollFrame = (timestamp: number) => {
    animationFrameId = undefined
    if (!isRunning.value) return
    if (document.visibilityState === 'hidden') {
      previousFrameTime = undefined
      return
    }

    if (previousFrameTime === undefined) {
      previousFrameTime = timestamp
      scheduleFrame()
      return
    }

    const elapsed = Math.min(timestamp - previousFrameTime, 50)
    previousFrameTime = timestamp
    const currentPosition = window.scrollY
    if (Math.abs(currentPosition - targetPosition) > 2) {
      targetPosition = currentPosition
    }
    targetPosition += (speed.value * elapsed) / 1000
    window.scrollTo({ left: 0, top: targetPosition, behavior: 'instant' })

    const documentElement = document.documentElement
    const maxScrollPosition = Math.max(
      0,
      documentElement.scrollHeight - documentElement.clientHeight,
    )
    const isAtBottom = currentPosition >= maxScrollPosition - 1
    if (isAtBottom && window.scrollY <= currentPosition + 0.001) {
      stalledFrames += 1
      if (stalledFrames >= 2) {
        if (!onScrollEnd()) {
          stop()
          return
        }
        stalledFrames = 0
        boundaryPollId = window.setTimeout(() => {
          boundaryPollId = undefined
          targetPosition = window.scrollY
          previousFrameTime = undefined
          scheduleFrame()
        }, 100)
        return
      }
    } else {
      stalledFrames = 0
    }

    scheduleFrame()
  }

  const start = () => {
    if (isRunning.value) return
    isRunning.value = true
    targetPosition = window.scrollY
    stalledFrames = 0
    scheduleFrame()
  }

  const toggle = () => {
    if (isRunning.value) stop()
    else start()
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      clearScheduledWork()
      return
    }
    targetPosition = window.scrollY
    scheduleFrame()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  onScopeDispose(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { isRunning, start, stop, toggle }
}
