import type { Awaitable } from '@vueuse/core'
import { nanoid } from 'nanoid'
import type { Ref } from 'vue'
import { ref } from 'vue'

export const useMiddleware = <HANDLER extends (...args: any[]) => Awaitable<void>>() => {
  type Handler = {
    id: string
    fn: HANDLER
  }

  const handlers = ref<Handler[]>([]) as unknown as Ref<Handler[]>

  const handlerFn = async (...args: Parameters<HANDLER>) => {
    for (const handler of handlers.value) {
      await handler.fn(...args)
    }
  }

  const cancel = (id: string) => {
    handlers.value = handlers.value.filter(h => h.id !== id)
  }

  const use = (callback: HANDLER) => {
    const id = nanoid()

    handlers.value.push({
      id,
      fn: callback,
    })

    console.log('adding handler', id)

    return {
      cancel: () => cancel(id),
    }
  }

  return {
    handler: handlerFn,
    use,
  }
}
