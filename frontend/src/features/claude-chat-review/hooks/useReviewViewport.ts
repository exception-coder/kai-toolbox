import { useLayoutEffect, type RefObject } from 'react'

export function useReviewViewport(root: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const viewport = window.visualViewport
    const element = root.current
    if (!element) return
    const documentStyle = document.documentElement.style
    const oldHeight = documentStyle.getPropertyValue('--review-visible-height')
    const oldTop = documentStyle.getPropertyValue('--review-visible-top')
    const update = () => {
      if (viewport && viewport.scale !== 1) return
      element.style.setProperty('--review-height', `${viewport?.height ?? window.innerHeight}px`)
      element.style.setProperty('--review-top', `${viewport?.offsetTop ?? 0}px`)
      documentStyle.setProperty('--review-visible-height', `${viewport?.height ?? window.innerHeight}px`)
      documentStyle.setProperty('--review-visible-top', `${viewport?.offsetTop ?? 0}px`)
    }
    update()
    viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update); window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update)
      if (oldHeight) documentStyle.setProperty('--review-visible-height', oldHeight); else documentStyle.removeProperty('--review-visible-height')
      if (oldTop) documentStyle.setProperty('--review-visible-top', oldTop); else documentStyle.removeProperty('--review-visible-top')
    }
  }, [root])
}
