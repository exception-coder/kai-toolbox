import type { ReactNode } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { Capability } from '../capabilities'

export function CapabilityDetail({ capability, children }: { capability: Capability; children: ReactNode }) {
  const Icon = capability.icon
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent hideCloseButton className="explore-detail w-full max-w-lg overflow-y-auto p-6 pt-12 sm:p-12 motion-reduce:transition-none">
        <SheetClose asChild><Button variant="ghost" className="absolute right-2 top-2 h-11 w-11" aria-label="关闭能力详情"><X size={18} /></Button></SheetClose>
        <div className="explore-eyebrow"><Icon size={18} />{capability.category}</div>
        <SheetTitle className="mt-6 text-2xl">{capability.name}</SheetTitle>
        <p className="mt-3 text-lg leading-relaxed">{capability.promise}</p>
        <SheetDescription className="mt-4 leading-7">{capability.description}</SheetDescription>
        {capability.guidePath && <Link className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline" to={capability.guidePath}>阅读能力说明书<ArrowRight size={16} /></Link>}
        <section className="explore-detail-section">
          <h3>适合这样的你</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            {capability.scenarios.map(scenario => <li key={scenario} className="flex gap-3"><span aria-hidden="true">·</span>{scenario}</li>)}
          </ul>
        </section>
        <section className="explore-detail-section">
          <h3>如何开始，到哪里收获结果</h3>
          <ol className="explore-detail-steps">
            {capability.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>)}
          </ol>
        </section>
        <section className="explore-detail-section">
          <h3>下一步</h3>
          <p className="my-4 text-sm leading-7 text-muted-foreground">{capability.entryHint}</p>
          <Button asChild className="h-11"><Link to={capability.destination}>{capability.action}<ArrowRight /></Link></Button>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">工具使用遵循当前账号权限，可能需要先登录。</p>
        </section>
      </SheetContent>
    </Sheet>
  )
}
