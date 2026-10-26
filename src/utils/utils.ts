import { formatDate } from '@vueuse/shared'
export const isNullOrBlank = (string: string | null | undefined | number) =>
  string === null ||
  string === undefined ||
  (typeof string === 'string' && string.trim().length === 0)

export const dateFormat = (/** @type {number} */ t: number) => {
  const time = Date.now()
  const offset = Math.floor((time - t) / 1000)
  let str = ''

  if (offset <= 30) {
    str = '刚刚'
  } else if (offset < 60) {
    str = offset + '秒前'
  } else if (offset < 3600) {
    str = Math.floor(offset / 60) + '分钟前'
  } else if (offset < 86400) {
    str = Math.floor(offset / 3600) + '小时前'
  } else if (offset < 2592000) {
    str = Math.floor(offset / 86400) + '天前'
  } else {
    str = formatDate(new Date(t), 'YYYY-MM-DD')
  }
  return str
}
