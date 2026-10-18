import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { uploadAttachment, type UploadedAttachment } from '../api'
import { useDraftAttachments, useDraftAttachmentUploads } from '../lib/attachmentDraftPref'
import { useComposerFileUpload } from './useComposerFileUpload'

vi.mock('../api', () => ({ uploadAttachment: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const files = [new File(['one'], 'one.txt'), new File(['two'], 'two.txt')]
const uploaded = (name: string): UploadedAttachment => ({ id: name, name, path: '/attachment/' + name, mime: 'text/plain', size: 3 })

it('reserves the entire batch across views, respects the quota and keeps send blocked until the batch completes', async () => {
  const resolvers: ((attachment: UploadedAttachment) => void)[] = []
  vi.mocked(uploadAttachment).mockImplementation(() => new Promise(resolve => resolvers.push(resolve)))
  const first = renderHook(() => useComposerFileUpload({ sessionId: 'batch', disabled: false, limit: 2 }))
  const second = renderHook(() => useComposerFileUpload({ sessionId: 'batch', disabled: false, limit: 2 }))
  const state = renderHook(() => ({ items: useDraftAttachments('batch')[0], pending: useDraftAttachmentUploads('batch')[0] }))
  let request!: Promise<void>
  act(() => { request = first.result.current.uploadFiles(files) })
  expect(state.result.current.pending).toBe(2)
  await act(async () => second.result.current.uploadFiles([new File(['extra'], 'extra.txt')]))
  expect(second.result.current.error).toContain('最多 2 个附件')
  expect(uploadAttachment).toHaveBeenCalledTimes(1)
  await act(async () => resolvers[0](uploaded('one.txt')))
  expect(state.result.current.pending).toBe(1)
  expect(uploadAttachment).toHaveBeenCalledTimes(2)
  await act(async () => { resolvers[1](uploaded('two.txt')); await request })
  expect(state.result.current.pending).toBe(0)
  expect(state.result.current.items.map(item => item.name)).toEqual(['one.txt', 'two.txt'])
})

it('binds late completions to the original session and never displays its failure in a different draft', async () => {
  let resolve!: (attachment: UploadedAttachment) => void
  let reject!: (failure: Error) => void
  vi.mocked(uploadAttachment).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    .mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail }))
  const hook = renderHook(({ sessionId }) => useComposerFileUpload({ sessionId, disabled: false, limit: 10 }),
    { initialProps: { sessionId: 'original' } })
  const original = renderHook(() => ({ items: useDraftAttachments('original')[0], pending: useDraftAttachmentUploads('original')[0] }))
  const next = renderHook(() => useDraftAttachments('next')[0])
  let request!: Promise<void>
  act(() => { request = hook.result.current.uploadFiles(files) })
  hook.rerender({ sessionId: 'next' })
  await act(async () => resolve(uploaded('one.txt')))
  await act(async () => { reject(new Error('old error')); await request })
  expect(uploadAttachment).toHaveBeenNthCalledWith(2, 'original', files[1])
  expect(original.result.current.items).toHaveLength(1)
  expect(original.result.current.pending).toBe(0)
  expect(next.result.current).toHaveLength(0)
  expect(hook.result.current.error).toBeNull()
})

it('reports upload and quota failures while retaining successful files, and denies a locked session', async () => {
  vi.mocked(uploadAttachment).mockRejectedValueOnce(new Error('文件过大')).mockResolvedValueOnce(uploaded('two.txt'))
  const hook = renderHook(() => useComposerFileUpload({ sessionId: 'partial', disabled: false, limit: 2 }))
  const items = renderHook(() => useDraftAttachments('partial')[0])
  await act(async () => hook.result.current.uploadFiles([...files, new File(['3'], 'three.txt')]))
  expect(hook.result.current.error).toContain('超出部分未上传')
  expect(hook.result.current.error).toContain('文件过大')
  expect(items.result.current).toHaveLength(1)
  const locked = renderHook(() => useComposerFileUpload({ sessionId: 'locked', disabled: true, limit: 10 }))
  await act(async () => locked.result.current.uploadFiles(files))
  expect(uploadAttachment).toHaveBeenCalledTimes(2)
  expect(locked.result.current.error).toContain('暂不可上传')
})
