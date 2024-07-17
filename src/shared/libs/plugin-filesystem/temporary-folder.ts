// import { ComputeOutput, Context, CynNode, IODef, createDefinition, path, schema } from '@cyn/plugin-core';
// import { nanoid } from 'nanoid'

// export const ID = 'temporary-folder'

// export type Data = {
// }

// export const definition = createDefinition({
//     inputs: {

//     },
//     outputs: {
//         value: {
//             type: 'data',
//             schema: schema.string()
//         }
//     }
// } satisfies IODef)

// export class TemporaryFolderNode extends CynNode<Data, typeof ID, typeof definition> {
//     width = 180;
//     height = 250;

//     path: string | undefined

//     constructor(context: Context) {
//         super(ID, "Temporary folder", context);

//         const value = new ClassicPreset.Output(path(), "Valeur")
//         this.addOutput('value', value);
//     }
//     run() { }
//     compute(): ComputeOutput<typeof definition> {
//         if (!this.path) {
//             this.path = nanoid()
//         }
//         return {
//             value: this.path
//         };
//     }

//     load(data: Data) {
//     }

//     save() {
//         return {
//         }
//     }
// }
