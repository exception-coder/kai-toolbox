import { Progress } from '@/components/ui/progress'

/** 用低透明度流动渐变铺满会话行，提示该会话仍在工作。 */
export function SessionActivityBar() {
  return (
    <Progress
      indeterminate
      aria-label="会话工作中"
      className="pointer-events-none absolute inset-0 z-0 h-full rounded-none bg-gradient-to-r from-violet-500/5 via-sky-400/5 to-emerald-400/5 [&>div]:w-1/2 [&>div]:rounded-none [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:via-sky-400 [&>div]:to-emerald-400 [&>div]:opacity-10 [&>div]:blur-sm motion-reduce:[&>div]:!w-full motion-reduce:[&>div]:!translate-x-0 motion-reduce:[&>div]:!animate-none motion-reduce:[&>div]:!blur-none"
    />
  )
}
