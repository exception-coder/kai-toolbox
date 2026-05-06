import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Inbox, Paperclip, RefreshCw, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatBytes, formatDate } from '@/lib/utils'
import { deleteMail, getMailDetail, getStats, listInbox } from '../api'
import type { MailListItem } from '../types'

const PAGE_SIZE = 50

export function MailInboxPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [filterRead, setFilterRead] = useState<boolean | undefined>(undefined)
  const [toAddress, setToAddress] = useState('')
  // 移动端单列视图控制：list | detail
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')

  const params = {
    size: PAGE_SIZE,
    keyword: keyword || undefined,
    isRead: filterRead,
    toAddress: toAddress || undefined,
  }

  const listQuery = useQuery({
    queryKey: ['mail-inbox', params],
    queryFn: () => listInbox(params),
    refetchInterval: 15_000,
  })

  const statsQuery = useQuery({
    queryKey: ['mail-stats'],
    queryFn: getStats,
    refetchInterval: 15_000,
  })

  const detailQuery = useQuery({
    queryKey: ['mail-detail', selectedId],
    queryFn: () => getMailDetail(selectedId!),
    enabled: selectedId != null,
    staleTime: 30_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMail(id),
    onSuccess: (_, id) => {
      if (selectedId === id) {
        setSelectedId(null)
        setMobileView('list')
      }
      qc.invalidateQueries({ queryKey: ['mail-inbox'] })
      qc.invalidateQueries({ queryKey: ['mail-stats'] })
      qc.removeQueries({ queryKey: ['mail-detail', id] })
    },
  })

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setMobileView('detail')
    qc.setQueryData(['mail-inbox', params], (old: typeof listQuery.data) => {
      if (!old) return old
      return {
        ...old,
        items: old.items.map(m => m.id === id ? { ...m, read: true } : m),
        unreadCount: old.items.find(m => m.id === id && !m.read)
          ? old.unreadCount - 1
          : old.unreadCount,
      }
    })
  }

  const stats = statsQuery.data
  const list = listQuery.data
  const detail = detailQuery.data

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶部状态栏 */}
      <div className="flex items-center gap-3 border-b px-4 py-3 md:px-6">
        {/* 移动端详情视图返回按钮 */}
        {mobileView === 'detail' && (
          <Button
            variant="ghost"
            size="sm"
            className="mr-1 h-7 gap-1 px-2 text-xs md:hidden"
            onClick={() => setMobileView('list')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            收件箱
          </Button>
        )}
        {mobileView === 'list' && (
          <Inbox className="h-4 w-4 text-[var(--color-muted-foreground)]" />
        )}
        <span className="text-sm font-medium">
          {mobileView === 'detail' && detail ? (detail.subject ?? '(无主题)') : '收件箱'}
        </span>
        {mobileView === 'list' && stats && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            共 {stats.total} 封
            {stats.unreadCount > 0 && (
              <span className="ml-1 font-medium text-[var(--color-foreground)]">
                · {stats.unreadCount} 未读
              </span>
            )}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-7 gap-1.5 px-2 text-xs', mobileView === 'list' ? 'ml-auto' : 'hidden md:flex md:ml-auto')}
          onClick={() => {
            qc.invalidateQueries({ queryKey: ['mail-inbox'] })
            qc.invalidateQueries({ queryKey: ['mail-stats'] })
          }}
          disabled={listQuery.isFetching}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', listQuery.isFetching && 'animate-spin')} />
          刷新
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左侧邮件列表：移动端详情视图时隐藏 */}
        <div className={cn(
          'flex flex-col border-r',
          'w-full md:w-80 md:shrink-0',
          mobileView === 'detail' ? 'hidden md:flex' : 'flex',
        )}>
          {/* 过滤工具栏 */}
          <div className="flex flex-col gap-2 border-b px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              <Input
                placeholder="搜索主题/发件人"
                className="h-8 pl-8 text-xs"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              <Button
                variant={filterRead === undefined ? 'default' : 'ghost'}
                size="sm"
                className="h-6 flex-1 px-2 text-xs"
                onClick={() => setFilterRead(undefined)}
              >
                全部
              </Button>
              <Button
                variant={filterRead === false ? 'default' : 'ghost'}
                size="sm"
                className="h-6 flex-1 px-2 text-xs"
                onClick={() => setFilterRead(false)}
              >
                未读
                {list && list.unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {list.unreadCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant={filterRead === true ? 'default' : 'ghost'}
                size="sm"
                className="h-6 flex-1 px-2 text-xs"
                onClick={() => setFilterRead(true)}
              >
                已读
              </Button>
            </div>
            <Input
              placeholder="按收件地址过滤"
              className="h-7 text-xs"
              value={toAddress}
              onChange={e => setToAddress(e.target.value)}
            />
          </div>

          {/* 邮件列表 */}
          <div className="flex-1 overflow-y-auto">
            {listQuery.isLoading && (
              <div className="px-4 py-8 text-center text-xs text-[var(--color-muted-foreground)]">
                加载中…
              </div>
            )}
            {listQuery.isError && (
              <div className="px-4 py-4 text-xs text-[var(--color-destructive)]">
                加载失败：{listQuery.error instanceof ApiError ? listQuery.error.message : '网络错误'}
              </div>
            )}
            {list?.items.length === 0 && !listQuery.isLoading && (
              <div className="px-4 py-8 text-center text-xs text-[var(--color-muted-foreground)]">
                暂无邮件
              </div>
            )}
            {list?.items.map(mail => (
              <MailListRow
                key={mail.id}
                mail={mail}
                selected={mail.id === selectedId}
                onSelect={() => handleSelect(mail.id)}
              />
            ))}
            {list && list.total > PAGE_SIZE && (
              <div className="px-4 py-2 text-center text-xs text-[var(--color-muted-foreground)]">
                显示前 {PAGE_SIZE} 封，共 {list.total} 封
              </div>
            )}
          </div>
        </div>

        {/* 右侧详情面板：移动端列表视图时隐藏 */}
        <div className={cn(
          'flex-1 flex-col overflow-hidden',
          mobileView === 'list' ? 'hidden md:flex' : 'flex',
        )}>
          {!selectedId && (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              选择一封邮件查看详情
            </div>
          )}

          {selectedId && detailQuery.isLoading && (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              加载中…
            </div>
          )}

          {detail && (
            <div className="flex h-full flex-col overflow-hidden">
              {/* 邮件头部（桌面端才显示主题，移动端已放到顶栏） */}
              <div className="border-b px-4 py-4 md:px-6">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="hidden text-base font-semibold leading-snug md:block">
                    {detail.subject ?? '(无主题)'}
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 shrink-0 gap-1.5 px-2 text-xs text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
                    onClick={() => deleteMutation.mutate(detail.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
                <div className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                  <div>
                    <span className="w-10 inline-block">发件人</span>
                    <span className="break-all text-[var(--color-foreground)]">{detail.fromAddr}</span>
                  </div>
                  <div>
                    <span className="w-10 inline-block">收件人</span>
                    <span className="break-all text-[var(--color-foreground)]">{detail.toAddr}</span>
                  </div>
                  <div>
                    <span className="w-10 inline-block">时间</span>
                    <span>{formatDate(detail.receivedAt)}</span>
                    {detail.rawSize != null && (
                      <span className="ml-3">{formatBytes(detail.rawSize)}</span>
                    )}
                  </div>
                  {detail.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {detail.attachments.map((att, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px]"
                        >
                          <Paperclip className="h-2.5 w-2.5" />
                          {att.filename ?? '附件'}
                          {att.size > 0 && ` (${formatBytes(att.size)})`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 邮件正文 */}
              <div className="flex-1 overflow-auto">
                {detail.bodyHtml ? (
                  <iframe
                    srcDoc={detail.bodyHtml}
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    title="邮件正文"
                    className="h-full min-h-[400px] w-full border-0"
                  />
                ) : detail.bodyText ? (
                  <pre className="whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed md:px-6">
                    {detail.bodyText}
                  </pre>
                ) : (
                  <div className="px-6 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                    (空邮件)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MailListRow({
  mail,
  selected,
  onSelect,
}: {
  mail: MailListItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full cursor-pointer border-b px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-accent)]',
        selected && 'bg-[var(--color-accent)]',
        !mail.read && 'bg-[var(--color-muted)]/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'truncate text-xs',
            !mail.read ? 'font-semibold text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]',
          )}
        >
          {mail.fromAddr}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {mail.hasAttachment && <Paperclip className="h-3 w-3 text-[var(--color-muted-foreground)]" />}
          {!mail.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
        </div>
      </div>
      <div
        className={cn(
          'mt-0.5 truncate text-xs',
          !mail.read ? 'font-medium text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]',
        )}
      >
        {mail.subject ?? '(无主题)'}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-[var(--color-muted-foreground)]">
          → {mail.toAddr}
        </span>
        <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
          {formatShortDate(mail.receivedAt)}
        </span>
      </div>
    </button>
  )
}

function formatShortDate(epochMs: number): string {
  const d = new Date(epochMs)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (isToday) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
