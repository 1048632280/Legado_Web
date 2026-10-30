import { onScopeDispose, ref, type Ref } from 'vue'

export const useAutoRead = (
  speed: Readonly<Ref<number>>,
  onScrollEnd: () => boolean,
) => {
  const isRunning = ref(false)
  let animationFrameId: number | undefined
  let boundaryPollId: number | undefined
  let previousFrameTime: number | undefined
  let stalledFrames = 0

  const stop = () => {
    isRunning.value = false
    previousFrameTime = undefined
    stalledFrames = 0
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = undefined
    }
    if (boundaryPollId !== undefined) {
      window.clearTimeout(boundaryPollId)
      boundaryPollId = undefined
    }
  }

  const scrollFrame = (timestamp: number) => {
    if (!isRunning.value) return

    if (previousFrameTime === undefined) {
      previousFrameTime = timestamp
      animationFrameId = requestAnimationFrame(scrollFrame)
      return
    }

    const elapsed = timestamp - previousFrameTime
    previousFrameTime = timestamp
    if (elapsed > 100) {
      animationFrameId = requestAnimationFrame(scrollFrame)
      return
    }

    const currentPosition = window.scrollY
    const pixelsToScroll = (speed.value * Math.min(elapsed, 50)) / 1000
    window.scrollBy(0, pixelsToScroll)

    if (window.scrollY <= currentPosition + 0.001) {
      stalledFrames += 1
      if (stalledFrames >= 2) {
        if (!onScrollEnd()) {
          stop()
          return
        }
        stalledFrames = 0
        animationFrameId = undefined
        boundaryPollId = window.setTimeout(() => {
          boundaryPollId = undefined
          if (isRunning.value) {
            animationFrameId = requestAnimationFrame(scrollFrame)
          }
        }, 100)
        return
      }
    } else {
      stalledFrames = 0
    }

    animationFrameId = requestAnimationFrame(scrollFrame)
  }

  const start = () => {
    if (isRunning.value) return
    isRunning.value = true
    previousFrameTime = undefined
    stalledFrames = 0
    animationFrameId = requestAnimationFrame(scrollFrame)
  }

  const toggle = () => {
    if (isRunning.value) stop()
    else start()
  }

  onScopeDispose(stop)

  return { isRunning, start, stop, toggle }
}
