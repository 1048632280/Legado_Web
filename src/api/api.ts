export type LegadoApiResponse<T> = {
  isSuccess: boolean
  errorMsg: string
  errorCode?: string
  data: T
}
