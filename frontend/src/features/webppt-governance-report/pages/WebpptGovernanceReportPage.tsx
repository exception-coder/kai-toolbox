import { WebpptDeck } from '../components/WebpptDeck'
import { slides } from '../slidesContent'

/**
 * 「VibeCoding 平台化治理」汇报页——ShowcaseLayout 已提供全屏外壳 + 返回工作台悬浮坞，
 * 这里只负责把内容数据（slidesContent.ts）交给 reveal.js 渲染组件。
 */
export function WebpptGovernanceReportPage() {
  return <WebpptDeck slides={slides} />
}
