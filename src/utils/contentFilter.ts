export type ContentFilterRule = {
  id: string
  search: string
  replacement: string
}

export type ContentFilterStorage = Record<string, ContentFilterRule[]>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const normalizeContentFilterRule = (
  value: unknown,
): ContentFilterRule | undefined => {
  if (!isRecord(value)) return
  if (
    typeof value.id !== 'string' ||
    typeof value.search !== 'string' ||
    typeof value.replacement !== 'string' ||
    value.id.length === 0 ||
    value.search.length === 0
  ) {
    return
  }
  return {
    id: value.id,
    search: value.search,
    replacement: value.replacement,
  }
}

export const normalizeContentFilterRules = (
  value: unknown,
): ContentFilterRule[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeContentFilterRule)
    .filter((rule): rule is ContentFilterRule => rule !== undefined)
}

export const normalizeContentFilterStorage = (
  value: unknown,
): ContentFilterStorage => {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([bookUrl, rules]) => [
      bookUrl,
      normalizeContentFilterRules(rules),
    ]),
  )
}

export const createContentFilterRuleId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 按规则顺序执行普通字符串替换，不把输入内容当作正则表达式。 */
export const applyContentFilters = (
  content: string,
  rules: readonly ContentFilterRule[],
) =>
  rules.reduce(
    (current, rule) => current.split(rule.search).join(rule.replacement),
    content,
  )
