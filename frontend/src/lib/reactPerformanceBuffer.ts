/**
 * React 19.2 DEV Performance Tracks 在 Chromium User Timing 中长期保留测量记录。
 * 仅清理 React 自己的 measure；不清理业务测量、mark、resource 或 navigation。
 * 与上游 clearMeasures 修复相同，已录入 DevTools 时间线的事件不受影响。
 * https://github.com/facebook/react/pull/34803
 */
export function observeReactPerformanceBuffer(): () => void {
  if (typeof PerformanceObserver === 'undefined'
    || !PerformanceObserver.supportedEntryTypes?.includes('measure')
    || typeof performance.clearMeasures !== 'function') return () => {}

  const observer = new PerformanceObserver(list => {
    const names = new Set<string>()
    for (const entry of list.getEntries()) {
      const detail = (entry as PerformanceMeasure).detail
      const tracks = detail?.devtools
      if (tracks?.track === 'Components ⚛' || tracks?.trackGroup === 'Scheduler ⚛') {
        names.add(entry.name)
      }
    }
    for (const name of names) performance.clearMeasures(name)
  })
  try {
    // 一次接收已有积累；后续只处理增量，不定时遍历整个性能时间线。
    observer.observe({ type: 'measure', buffered: true })
  } catch {
    // 诊断 API 不可用不得阻止主应用启动。
    observer.disconnect()
  }
  return () => observer.disconnect()
}
