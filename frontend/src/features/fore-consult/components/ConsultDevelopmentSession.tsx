import { useInfiniteQuery } from '@tanstack/react-query'
import { readDevelopmentSession } from '../suggestionApi'

/** 只是后台会话的只读观察者，组件卸载不取消审核、开发或提交。 */
export function ConsultDevelopmentSession({ userId }: { userId: number }) {
  const query = useInfiniteQuery({ queryKey: ['consult-development-session', userId], initialPageParam: 0,
    queryFn: ({ pageParam }) => readDevelopmentSession(pageParam),
    getNextPageParam: page => page.hasMore ? page.nextBefore : undefined,
    refetchInterval: 5000, retry: false })
  const events = [...new Map((query.data?.pages.flatMap(page => page.messages) ?? []).map(event => [event.sequence, event])).values()]
  return <section aria-label="需求开发会话">
    <h3 className="text-sm font-medium">{query.data?.pages[0]?.title ?? '业务咨询需求 · 后台开发会话'}</h3>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">审核、编码、验证和提交都在后台执行，关闭页面不会中断。这里显示真实阶段记录，最近记录在前；提交代码不代表已发布。</p>
    {query.isPending && <p role="status" className="mt-6 text-sm text-muted-foreground">正在读取开发会话…</p>}
    {query.isError && <p role="alert" className="mt-6 text-sm text-destructive">暂时无法读取会话，后台任务不会因此取消。<button onClick={() => void query.refetch()} className="ml-2 min-h-11 underline">重试读取</button></p>}
    {!query.isPending && !query.isError && !events.length && <p className="mt-6 text-sm text-muted-foreground">还没有开发记录。收到建议后，审核和开发过程会显示在这里。</p>}
    <ol className="mt-4 divide-y divide-border">{events.map(event => <li key={event.sequence} className="py-4">
      <div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">{event.phase}</span><time className="text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</time></div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{event.content}</p>
      <p className="mt-2 text-xs text-muted-foreground">需求 {event.suggestionId.slice(0, 8)}</p>
    </li>)}</ol>
    {query.hasNextPage && <button className="min-h-11 w-full text-xs underline disabled:opacity-50" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? '正在读取…' : '更早记录'}</button>}
  </section>
}
