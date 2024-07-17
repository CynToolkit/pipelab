export type Plugin = {
    nodes: Record<string, any>
    runtime: () => Promise<void>
}

export const createPlugin = (plugin: Plugin) => {
    return plugin
}