import { Block } from '@@/model'

export const walker = async (graph: Array<Block>, onNode: (node: Block) => Promise<void>) => {
  for (const node of graph) {
    if (node.type === 'condition') {
      await onNode(node)

      await walker(node.branchTrue, onNode)
      await walker(node.branchFalse, onNode)
    } else if (node.type === 'action') {
      await onNode(node)
    } else if (node.type === 'loop') {
      await onNode(node)

      await walker(node.children, onNode)
    } else if (node.type === 'comment') {
      await onNode(node)
    } else if (node.type === 'event') {
      await onNode(node)
    }
  }
}
