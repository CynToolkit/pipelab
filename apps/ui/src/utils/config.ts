import { useAPI } from '@renderer/composables/api'
import { klona } from 'klona'

export const loadInternalFile = (name: string) => {
  const api = useAPI()

  return api.execute('config:load', {
    config: name
  })
}

export const saveInternalFile = (name: string, data: unknown) => {
  const api = useAPI()

  api.execute('config:save', {
    config: name,
    data: JSON.stringify(klona(data))
  })
}

export const loadExternalFile = (path: string) => {
  const api = useAPI()

  return api.execute('fs:read', {
    path
  })
}

export const saveExternalFile = (path: string, data: unknown) => {
  const api = useAPI()

  api.execute('fs:write', {
    path,
    content: JSON.stringify(klona(data))
  })
}

export const createConfig = <T>(config: string) => {
  const api = useAPI()

  const load = async () => {
    return api.execute('config:load', {
      config
    }) as Promise<
      | { type: 'error'; ipcError: string; code?: string }
      | { type: 'success'; result: { result: T } }
    >
    // TODO: better typing
  }

  const save = async (data: T) => {
    await api.execute('config:save', {
      config,
      data: JSON.stringify(klona(data))
    })
  }

  const backup = async (suffix: string) => {
    const data = await load()
    if (data.type === 'error') {
      throw new Error(data.ipcError)
    }
    await api.execute('config:save', {
      config: `${config}_${suffix}`,
      data: JSON.stringify(klona(data.result.result))
    })
  }

  return {
    save,
    load,
    backup
  }
}
