import { FileText } from 'lucide-react'
import type { Theme } from '../types'

/** Part of the exported paper, with actions kept in the editor toolbar. */
export function WritingHeader({ theme }: { theme: Theme }) {
  if (theme !== 'writing') return null
  return <div className="md-card-writing-header"><FileText aria-hidden="true" /><span>写作</span></div>
}
