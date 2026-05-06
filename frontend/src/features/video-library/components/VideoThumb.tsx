import { useEffect, useState } from 'react'
import { Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { thumbUrl } from '../api'

interface Props {
  scanId: string
  path: string
  className?: string
  iconClassName?: string
}

/**
 * Lazy-loaded JPEG thumbnail with a graceful fallback to the {@code Film} icon when the
 * backend can't generate one (unsupported file, ffmpeg crash, etc.). Failures are tracked
 * per (scanId, path) so a re-render of the same item doesn't silently retry.
 */
export function VideoThumb({ scanId, path, className, iconClassName }: Props) {
  const [failed, setFailed] = useState(false)

  // Reset the failed state if the underlying file changes (parent passes a new path).
  useEffect(() => {
    setFailed(false)
  }, [scanId, path])

  if (failed) {
    return (
      <div className={cn('flex items-center justify-center bg-[var(--color-muted)]', className)}>
        <Film className={cn('h-4 w-4 text-[var(--color-muted-foreground)]', iconClassName)} />
      </div>
    )
  }

  return (
    <img
      src={thumbUrl(scanId, path)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('h-full w-full object-cover', className)}
    />
  )
}
