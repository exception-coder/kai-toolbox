import type { AssistantConversationMessage } from './types'

const ESTIMATED_MESSAGE_HEIGHT = 112
const OVERSCAN_PX = 560

interface ViewportOptions {
  scrollElement: HTMLElement
  listElement: HTMLElement
  renderMessage: (message: AssistantConversationMessage) => HTMLElement
  onTopReached?: () => void
}

/** Shadow DOM 内的轻量消息窗口，只挂载可视区域附近的消息节点。 */
export class AssistantConversationViewport {
  private readonly options: ViewportOptions
  private readonly topSpacer = document.createElement('div')
  private readonly itemsHost = document.createElement('div')
  private readonly bottomSpacer = document.createElement('div')
  private readonly heights = new Map<string, number>()
  private messages: AssistantConversationMessage[] = []
  private frame?: number
  private lastRange = ''
  private pendingStickToBottom = false

  constructor(options: ViewportOptions) {
    this.options = options
    this.topSpacer.setAttribute('aria-hidden', 'true')
    this.bottomSpacer.setAttribute('aria-hidden', 'true')
    options.listElement.replaceChildren(this.topSpacer, this.itemsHost, this.bottomSpacer)
    options.scrollElement.addEventListener('scroll', this.onScroll, { passive: true })
  }

  setMessages(messages: AssistantConversationMessage[], stickToBottom: boolean): void {
    const previousFirstId = this.messages[0]?.id
    const previousScrollHeight = this.options.scrollElement.scrollHeight
    const prepended = Boolean(previousFirstId && messages[0]?.id !== previousFirstId
      && messages.some(message => message.id === previousFirstId))
    this.pendingStickToBottom = stickToBottom
    this.messages = messages.map(message => ({ ...message }))
    this.render(true)
    requestAnimationFrame(() => {
      if (stickToBottom) {
        this.setScrollTopImmediately(this.options.scrollElement.scrollHeight)
      } else if (prepended) {
        this.setScrollTopImmediately(this.options.scrollElement.scrollTop
          + this.options.scrollElement.scrollHeight - previousScrollHeight)
      }
    })
  }

  destroy(): void {
    this.options.scrollElement.removeEventListener('scroll', this.onScroll)
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
  }

  private readonly onScroll = () => {
    if (this.options.scrollElement.scrollTop <= 160) this.options.onTopReached?.()
    if (this.frame !== undefined) return
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined
      this.render(false)
    })
  }

  private render(force: boolean): void {
    const range = this.visibleRange()
    const rangeKey = `${range.start}:${range.end}`
    if (!force && rangeKey === this.lastRange) return
    this.lastRange = rangeKey
    this.topSpacer.style.height = `${this.heightBetween(0, range.start)}px`
    this.bottomSpacer.style.height = `${this.heightBetween(range.end, this.messages.length)}px`
    const fragment = document.createDocumentFragment()
    this.messages.slice(range.start, range.end).forEach((message, offset) => {
      const wrapper = document.createElement('div')
      wrapper.dataset.viewportIndex = String(range.start + offset)
      wrapper.append(this.options.renderMessage(message))
      fragment.append(wrapper)
    })
    this.itemsHost.replaceChildren(fragment)
    requestAnimationFrame(() => this.measure(range.start, range.end))
  }

  private visibleRange(): { start: number; end: number } {
    if (this.messages.length === 0) return { start: 0, end: 0 }
    const top = Math.max(0, this.options.scrollElement.scrollTop - OVERSCAN_PX)
    const bottom = this.options.scrollElement.scrollTop
      + Math.max(this.options.scrollElement.clientHeight, 480) + OVERSCAN_PX
    let cursor = 0
    let start = 0
    while (start < this.messages.length && cursor + this.heightAt(start) < top) {
      cursor += this.heightAt(start)
      start += 1
    }
    start = Math.min(start, this.messages.length - 1)
    let end = start
    while (end < this.messages.length && cursor < bottom) {
      cursor += this.heightAt(end)
      end += 1
    }
    return { start, end: Math.min(this.messages.length, Math.max(start + 1, end)) }
  }

  private measure(start: number, end: number): void {
    let changed = false
    this.itemsHost.querySelectorAll<HTMLElement>('[data-viewport-index]').forEach(element => {
      const index = Number(element.dataset.viewportIndex)
      const message = this.messages[index]
      const height = Math.ceil(element.getBoundingClientRect().height)
      if (message && height > 0 && this.heights.get(message.id) !== height) {
        this.heights.set(message.id, height)
        changed = true
      }
    })
    if (changed) {
      this.topSpacer.style.height = `${this.heightBetween(0, start)}px`
      this.bottomSpacer.style.height = `${this.heightBetween(end, this.messages.length)}px`
      if (this.pendingStickToBottom) {
        requestAnimationFrame(() => {
          this.setScrollTopImmediately(this.options.scrollElement.scrollHeight)
        })
      }
    } else {
      this.pendingStickToBottom = false
    }
  }

  private heightAt(index: number): number {
    return this.heights.get(this.messages[index]?.id ?? '') ?? ESTIMATED_MESSAGE_HEIGHT
  }

  private heightBetween(start: number, end: number): number {
    let height = 0
    for (let index = start; index < end; index += 1) height += this.heightAt(index)
    return height
  }

  private setScrollTopImmediately(scrollTop: number): void {
    const previousBehavior = this.options.scrollElement.style.scrollBehavior
    this.options.scrollElement.style.scrollBehavior = 'auto'
    this.options.scrollElement.scrollTop = scrollTop
    this.options.scrollElement.style.scrollBehavior = previousBehavior
  }
}
