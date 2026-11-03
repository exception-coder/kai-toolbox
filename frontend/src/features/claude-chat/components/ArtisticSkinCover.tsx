import { workbenchThemeStyle, type WorkbenchTheme } from '../lib/workbenchTheme'

/** 静态艺术封面，不挂载聊天业务组件、不发起请求。 */
export function ArtisticSkinCover({ theme, strength }: { theme: WorkbenchTheme; strength: number }) {
  return <div className="wb-art-cover" data-workbench-theme={theme} style={workbenchThemeStyle(theme, strength)} aria-hidden="true">
    <svg viewBox="0 0 240 160" fill="none">
      {theme === 'atelier-paper' && <>
        <path d="M32 33L193 23 209 136 44 145Z" fill="var(--wb-raised)" stroke="var(--wb-border)" />
        <path d="M24 24L187 18 194 128 29 136Z" fill="var(--wb-surface)" stroke="var(--wb-border)" />
        <path d="M38 27l2 100M49 51l110-4M50 61l81-3M51 79l115-4M52 90l105-4M53 101l68-2" stroke="var(--wb-accent)" opacity=".4" />
        <path d="M147 104l62-4 2 25-62 4Z" fill="var(--wb-accent)" />
        <text x="159" y="118" fill="var(--wb-sidebar)" fontSize="8" fontFamily="serif">ATELIER</text>
      </>}
      {theme === 'editorial-press' && <>
        <path d="M24 16H216V145H24Z" fill="var(--wb-surface)" stroke="var(--wb-border)" />
        <text x="36" y="47" fill="currentColor" fontFamily="Georgia, serif" fontSize="25" fontWeight="700">The Daily</text>
        <path d="M35 58h170m-170 4h170M119 71v61M35 83h73m-73 7h73m-73 7h73m-73 7h73m-73 7h73m-73 7h73M130 83h73m-73 7h73m-73 7h73m-73 7h73m-73 7h73m-73 7h73" stroke="currentColor" opacity=".45" />
        <path d="M127 123l63-16" stroke="var(--wb-keyword)" strokeWidth="2" />
        <text x="35" y="75" fill="var(--wb-accent)" fontSize="6">WORKSPACE / EDITION 01</text>
      </>}
      {theme === 'amber-crt' && <>
        <rect x="20" y="18" width="200" height="124" rx="14" fill="var(--wb-raised)" stroke="var(--wb-border)" />
        <rect x="29" y="26" width="182" height="106" rx="10" fill="var(--wb-sidebar)" stroke="var(--wb-accent)" strokeOpacity=".4" />
        <path d="M43 47l8 6-8 6m16 0h13M43 76h113m-113 9h87m-87 9h101" stroke="var(--wb-accent)" strokeWidth="2" />
        <rect x="43" y="109" width="7" height="10" fill="var(--wb-accent)" />
        {[36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 102, 108, 114, 120].map(y => <path key={y} d={`M31 ${y}H209`} stroke="var(--wb-accent)" opacity=".08" />)}
      </>}
      {theme === 'liquid-titanium' && <>
        <path d="M29 38L178 17 214 49 61 75Z" fill="var(--wb-raised)" stroke="var(--wb-accent)" strokeOpacity=".65" />
        <path d="M29 38v66l32 36V75M61 140l153-25V49" fill="var(--wb-surface)" stroke="var(--wb-border)" />
        <path d="M74 87l126-21m-126 25l126-21m-126 25l126-21m-126 25l126-21m-126 25l126-21m-126 25l126-21m-126 25l126-21m-126 25l126-21" stroke="var(--wb-muted)" opacity=".22" />
        <path d="M82 47l77-12 14 12-77 13Z" fill="var(--wb-sidebar)" stroke="var(--wb-border)" />
        <circle cx="188" cy="114" r="3" fill="var(--wb-accent)" />
      </>}
    </svg>
  </div>
}
