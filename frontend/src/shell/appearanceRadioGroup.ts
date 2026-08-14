import type { KeyboardEvent } from 'react'

const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp'])
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown'])

/** 为自绘 radio 卡补齐原生单选组的方向键、Home 与 End 行为。 */
export function handleAppearanceRadioKeyDown<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  optionIds: readonly T[],
  selectedId: T,
  onSelect: (id: T) => void,
): void {
  if (!PREVIOUS_KEYS.has(event.key) && !NEXT_KEYS.has(event.key) && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()

  const selectedIndex = Math.max(0, optionIds.indexOf(selectedId))
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? optionIds.length - 1
      : PREVIOUS_KEYS.has(event.key)
        ? (selectedIndex - 1 + optionIds.length) % optionIds.length
        : (selectedIndex + 1) % optionIds.length
  const nextId = optionIds[nextIndex]
  if (!nextId) return

  onSelect(nextId)
  const radios = event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')
  radios.item(nextIndex)?.focus()
}
