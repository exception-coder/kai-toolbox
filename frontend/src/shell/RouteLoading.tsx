import { Menu } from 'lucide-react'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { useMobileNavigation } from './MobileNavigationContext'

export function RouteLoading({ title, integratedHeader }: { title: string; integratedHeader: boolean }) {
  const openNavigation = useMobileNavigation()
  return <PageSkeleton title={title} action={integratedHeader && openNavigation &&
    <button type="button" aria-label="打开导航" onClick={openNavigation}
      className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-accent)] md:hidden">
      <Menu className="size-4" />
    </button>} />
}
