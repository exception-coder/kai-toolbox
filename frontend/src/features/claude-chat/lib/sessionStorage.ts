import type { SessionStorageView } from '../types'

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** 文件逻辑长度使用 1024 进位；不将未知值格式化成零。 */
export function formatStorageBytes(bytes: number): string {
  const unit = Math.min(Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** unit
  return `${unit === 0 ? String(bytes) : value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, '')} ${UNITS[unit]}`
}

export function storageLabel(view?: SessionStorageView, failed = false): string {
  if (!view) return failed ? '记录暂无法获取' : '统计记录…'
  if (view.bytes != null && (view.status === 'available' || view.status === 'partial')) {
    return `${view.status === 'partial' ? '部分已知' : '记录'} ${formatStorageBytes(view.bytes)}`
  }
  if (view.status === 'pending') return '记录尚未生成'
  if (view.status === 'missing') return '未找到记录'
  return '记录暂无法获取'
}

export function storageDescription(view?: SessionStorageView, failed = false): string {
  if (!view) return failed ? '文件大小读取失败，可稍后刷新重试' : '只读文件元信息，不影响消息加载'
  const engines = view.engines.map(engine => `${engine.engine === 'unknown' ? '历史记录' : engine.engine}：${engine.bytes == null
    ? engine.description : `${formatStorageBytes(engine.bytes)} · ${engine.fileCount} 个文件 · ${engine.description}`}`)
  return [view.description, ...engines, `读取于 ${new Date(view.checkedAt).toLocaleString()}`,
    ...(failed ? ['更新失败，当前显示上次读取的结果'] : [])].join('\n')
}
