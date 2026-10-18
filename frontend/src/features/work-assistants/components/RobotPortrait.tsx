/** 两位机器人的统一矢量肖像；造型区分职责，主题色继承 Forge。 */
export function RobotPortrait({ kind, size = 56 }: { kind: string; size?: number }) {
  const weekly = kind === 'weekly'
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="58" height="58" rx="16" fill="currentColor" opacity=".07" />
    <path d="M32 12v7m-5-7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <rect x="14" y="20" width="36" height="29" rx={weekly ? 9 : 5} stroke="currentColor" strokeWidth="2" />
    <path d="M10 29v10m44-10v10M23 53h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    {weekly ? <><rect x="21" y="28" width="8" height="7" rx="2" stroke="currentColor" strokeWidth="2" /><rect x="35" y="28" width="8" height="7" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M29 31h6m-9 10h12" stroke="currentColor" strokeWidth="2" /></>
      : <><circle cx="24" cy="31" r="3" fill="currentColor" /><circle cx="40" cy="31" r="3" fill="currentColor" /><path d="M25 40q7 6 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>}
  </svg>
}
