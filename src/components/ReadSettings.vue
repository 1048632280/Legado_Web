<template>
  <div class="settings-wrapper" :style="popupTheme" :class="{ night: isNight, day: !isNight }">
    <div class="settings-title">设置</div>
    <div class="setting-list">
      <div class="setting-row">
        <i>阅读主题</i>
        <span
          v-for="(color, index) in themeColors"
          :key="index"
          class="theme-item"
          :class="{ selected: theme === index }"
          :style="color"
          @click="store.config.theme = index"
        >
          <em v-if="index < 6" class="iconfont">&#58980;</em>
          <em v-else class="moon-icon">{{ moonIcon }}</em>
        </span>
      </div>
      <div class="setting-row font-list">
        <i>正文字体</i>
        <span
          v-for="(font, index) in fonts"
          :key="font"
          class="font-item"
          :class="{ selected: store.config.font === index }"
          @click="store.config.font = index"
        >{{ font }}</span>
      </div>
      <div class="setting-row"><i>字体大小</i><div class="resize"><button @click="lessFontSize"><em class="iconfont">&#58966;</em></button><span>{{ store.config.fontSize }}</span><button @click="moreFontSize"><em class="iconfont">&#58976;</em></button></div></div>
      <div class="setting-row"><i>字距</i><div class="resize"><button @click="store.config.spacing.letter -= 0.01"><em class="iconfont">&#58966;</em></button><span>{{ store.config.spacing.letter.toFixed(2) }}</span><button @click="store.config.spacing.letter += 0.01"><em class="iconfont">&#58976;</em></button></div></div>
      <div class="setting-row"><i>行距</i><div class="resize"><button @click="store.config.spacing.line -= 0.1"><em class="iconfont">&#58966;</em></button><span>{{ store.config.spacing.line.toFixed(1) }}</span><button @click="store.config.spacing.line += 0.1"><em class="iconfont">&#58976;</em></button></div></div>
      <div class="setting-row"><i>段距</i><div class="resize"><button @click="store.config.spacing.paragraph -= 0.1"><em class="iconfont">&#58966;</em></button><span>{{ store.config.spacing.paragraph.toFixed(1) }}</span><button @click="store.config.spacing.paragraph += 0.1"><em class="iconfont">&#58976;</em></button></div></div>
      <div v-if="!store.miniInterface" class="setting-row"><i>页面宽度</i><div class="resize"><button @click="lessReadWidth"><em class="iconfont">&#58965;</em></button><span>{{ store.config.readWidth }}</span><button @click="moreReadWidth"><em class="iconfont">&#58975;</em></button></div></div>
      <div class="setting-row"><i>翻页速度</i><div class="resize"><button @click="lessJumpDuration"><em class="iconfont">&#xe625;</em></button><span>{{ store.config.jumpDuration }}</span><button @click="moreJumpDuration"><em class="iconfont">&#xe626;</em></button></div></div>
      <div class="setting-row auto-read-speed-row">
        <label for="auto-read-speed">自动阅读速度</label>
        <input
          id="auto-read-speed"
          class="speed-slider"
          type="range"
          min="1"
          max="600"
          step="1"
          :value="store.config.autoReadSpeed"
          :aria-valuetext="`${store.config.autoReadSpeed} 像素/秒`"
          @input="updateAutoReadSpeedFromSlider"
        />
        <input
          class="speed-number"
          type="number"
          min="1"
          max="600"
          step="1"
          :value="store.config.autoReadSpeed"
          aria-label="自动阅读速度，像素每秒"
          @change="updateAutoReadSpeedFromInput"
        />
        <span class="speed-unit">px/s</span>
      </div>
      <div class="setting-row">
        <i>无限加载</i>
        <div class="toggle-options">
          <button :class="{ selected: !store.config.infiniteLoading }" @click="store.config.infiniteLoading = false">关闭</button>
          <button :class="{ selected: store.config.infiniteLoading }" @click="store.config.infiniteLoading = true">开启</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import '../assets/fonts/iconfont.css'
import settings from '@/config/themeConfig'
import API from '@api'
import { useDebounceFn } from '@vueuse/shared'

const store = useBookStore()
const saveConfigDebounce = useDebounceFn(() => API.saveReadConfig(store.config), 500)
watch(() => store.config, saveConfigDebounce, { deep: 2 })

const theme = computed(() => store.theme)
const isNight = computed(() => store.isNight)
const moonIcon = computed(() => (theme.value === 6 ? '' : ''))
const popupTheme = computed(() => ({ background: settings.themes[theme.value].popup }))
const fonts = ['宋体', '黑体', '楷体', '苹方', '微软雅黑']
const themeColors = [
  { background: 'rgba(250, 245, 235, 0.8)' },
  { background: 'rgba(245, 234, 204, 0.8)' },
  { background: 'rgba(230, 242, 230, 0.8)' },
  { background: 'rgba(228, 241, 245, 0.8)' },
  { background: 'rgba(245, 228, 228, 0.8)' },
  { background: 'rgba(224, 224, 224, 0.8)' },
  { background: 'rgba(0, 0, 0, 0.5)' },
]

const moreFontSize = () => {
  if (store.config.fontSize < 48) store.config.fontSize += 2
}
const lessFontSize = () => {
  if (store.config.fontSize > 12) store.config.fontSize -= 2
}
const moreReadWidth = () => {
  if (store.config.readWidth + 160 + 2 * 68 <= window.innerWidth) store.config.readWidth += 160
}
const lessReadWidth = () => {
  if (store.config.readWidth > 640) store.config.readWidth -= 160
}
const moreJumpDuration = () => {
  if (store.config.jumpDuration < 10000) store.config.jumpDuration += 100
}
const lessJumpDuration = () => {
  if (store.config.jumpDuration > 0) store.config.jumpDuration -= 100
}
const AUTO_READ_SPEED_MIN = 1
const AUTO_READ_SPEED_MAX = 600
const clampAutoReadSpeed = (value: number) =>
  Math.min(AUTO_READ_SPEED_MAX, Math.max(AUTO_READ_SPEED_MIN, Math.round(value)))
const updateAutoReadSpeedFromSlider = (event: Event) => {
  const input = event.target as HTMLInputElement
  store.config.autoReadSpeed = clampAutoReadSpeed(Number(input.value))
}
const updateAutoReadSpeedFromInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (!Number.isFinite(value) || input.value.trim() === '') {
    input.value = String(store.config.autoReadSpeed)
    return
  }
  store.config.autoReadSpeed = clampAutoReadSpeed(value)
  input.value = String(store.config.autoReadSpeed)
}
</script>

<style lang="scss" scoped>
.settings-wrapper {
  min-width: 270px;
  padding: 18px 22px;
}

.iconfont,
.moon-icon {
  font-family: iconfont;
  font-style: normal;
}

.settings-title {
  margin-bottom: 16px;
  color: #ed4259;
  font-size: 18px;
}

.setting-row {
  display: flex;
  align-items: center;
  min-height: 38px;
  gap: 10px;

  i {
    flex: 0 0 72px;
    font-style: normal;
  }
}

.auto-read-speed-row {
  flex-wrap: wrap;

  label {
    flex: 0 0 72px;
  }

  .speed-slider {
    flex: 1 1 90px;
    min-width: 72px;
    accent-color: #ed4259;
  }

  .speed-number {
    width: 62px;
    min-height: 30px;
    padding: 3px 5px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 3px;
    background: transparent;
    color: inherit;
  }

  .speed-unit {
    margin-left: -6px;
    font-size: 12px;
  }
}

.theme-item,
.font-item,
.resize button,
.toggle-options button {
  cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.14);
}

.theme-item {
  width: 22px;
  height: 22px;
  border-radius: 50%;

  .iconfont,
  .moon-icon {
    display: none;
    line-height: 22px;
  }

  &.selected {
    .iconfont,
    .moon-icon {
      display: inline;
    }
  }
}

.font-list {
  flex-wrap: wrap;
}

.font-item,
.toggle-options button,
.resize button {
  padding: 3px 7px;
  background: transparent;
}

.selected {
  outline: 2px solid #ed4259;
  outline-offset: 1px;
}

.resize,
.toggle-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resize span {
  min-width: 38px;
  text-align: center;
}
</style>
