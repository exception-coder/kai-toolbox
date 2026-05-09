export const SKELETON_THRESHOLD = 500 * 1024
export const RAW_DEFAULT_THRESHOLD = 2 * 1024 * 1024

/**
 * 文件 size 决定首次打开默认视图：
 * - >= 2MB 默认走原始文本（避免主线程冻结）
 * - 其它走 markdown
 */
export function chooseInitialViewMode(size: number): 'markdown' | 'raw' {
  return size >= RAW_DEFAULT_THRESHOLD ? 'raw' : 'markdown'
}

/** 中等大小（>= 500KB）时给一个骨架屏提示，让用户感知到正在渲染。 */
export function shouldShowSkeleton(size: number): boolean {
  return size >= SKELETON_THRESHOLD
}
