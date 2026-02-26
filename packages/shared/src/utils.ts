export const foo = 'bar'

export type WithId<T> = T extends (string | number) ? never : T & { id: string }
