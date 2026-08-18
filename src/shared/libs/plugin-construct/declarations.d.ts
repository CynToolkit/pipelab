declare module '*.webp'

declare const localforage: {
  setItem(key: string, value: any): Promise<any>
  getItem(key: string): Promise<any>
  removeItem(key: string): Promise<void>
  clear(): Promise<void>
}
