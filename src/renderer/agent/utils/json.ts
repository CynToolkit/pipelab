export const safeParse = <T>(str: string): T | undefined => {
    try {
        return JSON.parse(str);
    } catch (e) {
        return undefined
    }
}