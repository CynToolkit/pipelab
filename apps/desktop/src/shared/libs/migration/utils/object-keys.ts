export type ObjectKeys<T extends object> = `${Exclude<keyof T, symbol>}`;

export const objectKeys = Object.keys as <Type extends object>(
  value: Type
) => Array<ObjectKeys<Type>>;
export const objectEntries = Object.entries as <Type extends Record<PropertyKey, unknown>>(
  value: Type
) => Array<[ObjectKeys<Type>, Type[ObjectKeys<Type>]]>;
