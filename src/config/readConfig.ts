import type { webReadConfig } from '@/web'
import settings from './themeConfig'

export const DEFAULT_READ_CONFIG: webReadConfig = {
  theme: 0,
  font: 4,
  fontSize: 18,
  readWidth: 800,
  infiniteLoading: false,
  jumpDuration: 1000,
  autoReadSpeed: 30,
  spacing: {
    paragraph: 1,
    line: 0.8,
    letter: 0,
  },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const integerInRange = (
  value: unknown,
  min: number,
  max: number,
): number | undefined => {
  const number = finiteNumber(value)
  if (number === undefined) return undefined
  const integer = Math.trunc(number)
  return integer >= min && integer <= max ? integer : undefined
}

const numberInRange = (
  value: unknown,
  min: number,
  max: number,
): number | undefined => {
  const number = finiteNumber(value)
  if (number === undefined) return undefined
  if (number < min || number > max) return undefined
  return number
}

export const createDefaultReadConfig = (): webReadConfig => ({
  ...DEFAULT_READ_CONFIG,
  spacing: { ...DEFAULT_READ_CONFIG.spacing },
})

export const normalizeReadConfig = (value: unknown): webReadConfig => {
  const config = createDefaultReadConfig()
  if (!isRecord(value)) return config

  const theme = integerInRange(value.theme, 0, settings.themes.length - 1)
  if (theme !== undefined) config.theme = theme

  const font = integerInRange(value.font, 0, settings.fonts.length - 1)
  if (font !== undefined) config.font = font

  const fontSize = integerInRange(value.fontSize, 12, 48)
  if (fontSize !== undefined) config.fontSize = fontSize

  const readWidth = integerInRange(value.readWidth, 640, 2400)
  if (readWidth !== undefined) config.readWidth = readWidth

  const jumpDuration = integerInRange(value.jumpDuration, 0, 10000)
  if (jumpDuration !== undefined) config.jumpDuration = jumpDuration

  const autoReadSpeed = integerInRange(value.autoReadSpeed, 1, 600)
  if (autoReadSpeed !== undefined) config.autoReadSpeed = autoReadSpeed

  if (typeof value.infiniteLoading === 'boolean') {
    config.infiniteLoading = value.infiniteLoading
  }

  if (isRecord(value.spacing)) {
    const paragraph = numberInRange(value.spacing.paragraph, 0, 5)
    if (paragraph !== undefined) config.spacing.paragraph = paragraph

    const line = numberInRange(value.spacing.line, 0, 5)
    if (line !== undefined) config.spacing.line = line

    const letter = numberInRange(value.spacing.letter, -1, 2)
    if (letter !== undefined) config.spacing.letter = letter
  }

  return config
}
