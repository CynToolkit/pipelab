// import { nanoid } from 'nanoid'
// import { useMessaging } from './ws'

// export const useWSLogger = () => {
//     const messaging = useMessaging()

//     const log = (...args: any[]) => {
//         console.log(...args)
//         messaging.send({
//             type: "log",
//             data: args[0],
//             id: nanoid()
//         })
//     }

//     return {
//         log,
//     }
// }
