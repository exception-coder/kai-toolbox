import { twMerge } from 'tailwind-merge'

export function cn(...values: (string | false | undefined)[]) {
  return twMerge(values.filter(Boolean).join(' '))
}
