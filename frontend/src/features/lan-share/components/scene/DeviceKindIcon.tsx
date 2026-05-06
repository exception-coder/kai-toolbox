import type { DeviceKind } from '../../types'

interface Props {
  kind: DeviceKind
  size?: number
  className?: string
}

// 所有 SVG viewBox 统一为 100x100，调用方通过 size 控制实际尺寸
export function DeviceKindIcon({ kind, size = 64, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={kind}
    >
      {renderShape(kind)}
    </svg>
  )
}

function renderShape(kind: DeviceKind) {
  switch (kind) {
    case 'iphone':
      return (
        <g>
          {/* 圆角矩形机身 */}
          <rect x="32" y="10" width="36" height="80" rx="7" fill="#1c1c1e" stroke="#3a3a3c" strokeWidth="0.8" />
          {/* 屏幕 */}
          <rect x="34.5" y="14" width="31" height="72" rx="4" fill="#0a84ff" opacity="0.85" />
          {/* 顶部刘海 */}
          <rect x="44" y="14" width="12" height="3.5" rx="1.7" fill="#1c1c1e" />
          {/* 底部 Home Indicator */}
          <rect x="42" y="83" width="16" height="1.4" rx="0.7" fill="#ffffff" opacity="0.9" />
        </g>
      )
    case 'ipad':
      return (
        <g>
          <rect x="14" y="22" width="72" height="56" rx="5" fill="#1c1c1e" stroke="#3a3a3c" strokeWidth="0.8" />
          <rect x="17" y="25" width="66" height="50" rx="3" fill="#0a84ff" opacity="0.85" />
          {/* 摄像头 */}
          <circle cx="11.5" cy="50" r="1.2" fill="#3a3a3c" />
        </g>
      )
    case 'android-phone':
      return (
        <g>
          <rect x="32" y="10" width="36" height="80" rx="6" fill="#202124" stroke="#3c4043" strokeWidth="0.8" />
          <rect x="34.5" y="14" width="31" height="72" rx="3" fill="#34a853" opacity="0.85" />
          {/* 顶部水滴 */}
          <circle cx="50" cy="16" r="1.4" fill="#202124" />
          {/* 底部三键 */}
          <rect x="40" y="84" width="2" height="2" fill="#9aa0a6" />
          <rect x="49" y="84" width="2" height="2" fill="#9aa0a6" />
          <rect x="58" y="84" width="2" height="2" fill="#9aa0a6" />
        </g>
      )
    case 'android-tablet':
      return (
        <g>
          <rect x="14" y="22" width="72" height="56" rx="4" fill="#202124" stroke="#3c4043" strokeWidth="0.8" />
          <rect x="17" y="25" width="66" height="50" rx="2" fill="#34a853" opacity="0.85" />
          <circle cx="11.5" cy="50" r="1.2" fill="#3c4043" />
        </g>
      )
    case 'windows':
      return (
        <g>
          {/* 显示器 */}
          <rect x="14" y="18" width="72" height="48" rx="3" fill="#1f1f1f" stroke="#3a3a3a" strokeWidth="0.8" />
          <rect x="17" y="21" width="66" height="42" rx="1.5" fill="#0078d4" opacity="0.9" />
          {/* 任务栏方块 */}
          <rect x="20" y="55" width="6" height="6" fill="#ffffff" opacity="0.9" />
          {/* 底座 */}
          <rect x="42" y="66" width="16" height="3" fill="#3a3a3a" />
          <rect x="32" y="69" width="36" height="4" rx="1" fill="#3a3a3a" />
        </g>
      )
    case 'mac':
      return (
        <g>
          {/* 翻盖屏幕 */}
          <rect x="14" y="20" width="72" height="46" rx="3" fill="#1c1c1e" stroke="#3a3a3c" strokeWidth="0.8" />
          <rect x="16.5" y="22.5" width="67" height="41" rx="1.5" fill="#5e5ce6" opacity="0.85" />
          {/* 苹果光晕 */}
          <circle cx="50" cy="42" r="3" fill="#ffffff" opacity="0.45" />
          {/* 底座（笔记本翻盖底） */}
          <rect x="10" y="66" width="80" height="3" rx="1" fill="#48484a" />
          <rect x="42" y="69" width="16" height="2" rx="1" fill="#3a3a3c" />
        </g>
      )
    case 'linux':
      return (
        <g>
          <rect x="14" y="18" width="72" height="48" rx="3" fill="#1f1f1f" stroke="#3a3a3a" strokeWidth="0.8" />
          <rect x="17" y="21" width="66" height="42" rx="1.5" fill="#000000" opacity="0.85" />
          {/* 终端提示符 */}
          <text x="22" y="44" fontFamily="monospace" fontSize="14" fill="#33ff66">$_</text>
          <rect x="42" y="66" width="16" height="3" fill="#3a3a3a" />
          <rect x="32" y="69" width="36" height="4" rx="1" fill="#3a3a3a" />
        </g>
      )
    case 'unknown':
    default:
      return (
        <g>
          <rect x="20" y="20" width="60" height="60" rx="6" fill="#3a3a3c" stroke="#5a5a5c" strokeWidth="0.8" />
          <text x="50" y="58" textAnchor="middle" fontFamily="sans-serif" fontSize="32" fontWeight="600" fill="#ffffff" opacity="0.85">?</text>
        </g>
      )
  }
}
