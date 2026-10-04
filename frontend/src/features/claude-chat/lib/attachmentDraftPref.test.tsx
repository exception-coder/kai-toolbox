import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDraftAttachmentUploads } from './attachmentDraftPref'

describe('draft attachment uploads', () => {
  it('shares in-flight uploads across views of the same session', () => {
    const first = renderHook(() => useDraftAttachmentUploads('upload-session-a'))
    const second = renderHook(() => useDraftAttachmentUploads('upload-session-a'))
    const other = renderHook(() => useDraftAttachmentUploads('upload-session-b'))

    act(() => first.result.current[1](count => count + 1))
    expect(second.result.current[0]).toBe(1)
    expect(other.result.current[0]).toBe(0)

    act(() => second.result.current[1](count => count - 1))
    expect(first.result.current[0]).toBe(0)

    first.unmount()
    second.unmount()
    other.unmount()
  })
})
