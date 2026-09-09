import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function WorkspaceDialog({ title, description, close, children }: {
  title: string; description: string; close: () => void; children: ReactNode;
}) {
  return <Dialog.Root open onOpenChange={open => { if (!open) close() }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-32px)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-lg">
      <div className="flex items-start justify-between gap-4"><div><Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
        <Dialog.Description className="mb-6 mt-2 text-sm text-muted-foreground">{description}</Dialog.Description></div>
        <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭"><X size={16} /></Button></Dialog.Close></div>
      {children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
