import { captureNode } from './exporter'

/** Start clipboard.write in the click stack; rendering resolves its PNG representation later. */
export async function copyCardImage(nodes: HTMLElement[]): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') {
    throw new Error('当前浏览器不支持复制图片，请使用 HTTPS 下的 Chrome、Edge 或 Safari。')
  }
  if (!nodes.length) throw new Error('卡片渲染器未就绪，请稍后重试。')
  const image = renderImage(nodes)
  // A denied clipboard permission must not leave a rendering rejection unhandled.
  void image.catch(() => undefined)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })])
}

async function renderImage(nodes: HTMLElement[]): Promise<Blob> {
  if (nodes.length === 1) {
    const response = await fetch(await captureNode(nodes[0]))
    if (!response.ok) throw new Error('图片生成失败，请重试。')
    return response.blob()
  }
  // Clipboard implementations commonly accept only one image: preserve every slide in one strip.
  const images: HTMLImageElement[] = []
  for (const node of nodes) {
    const image = new Image()
    image.src = await captureNode(node)
    await image.decode()
    images.push(image)
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(...images.map(image => image.naturalWidth))
  canvas.height = images.reduce((height, image) => height + image.naturalHeight, 0)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('图片合成失败，请重试。')
  let top = 0
  for (const image of images) {
    context.drawImage(image, 0, top)
    top += image.naturalHeight
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob)
    else reject(new Error('图片过大或生成失败，请减少内容后重试。'))
  }, 'image/png'))
}
