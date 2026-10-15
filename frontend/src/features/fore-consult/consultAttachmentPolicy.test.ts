import { beforeEach, expect, it, vi } from 'vitest'
import { http } from '@/lib/api'
import { checkConsultFiles } from './consultAttachmentPolicy'
vi.mock('@/lib/api', () => ({ http: vi.fn() }))
beforeEach(() => vi.resetAllMocks())

it('uses fresh server limits before staging files and retains acceptable files in a mixed batch', async () => {
  const small = new File(['small'], 'small.html')
  const large = new File(['large data'], 'large.html')
  vi.mocked(http).mockResolvedValueOnce({ effectiveUploadBytes: 6 }).mockResolvedValueOnce({ effectiveUploadBytes: 20 })
  const first = await checkConsultFiles([small, large])
  expect(first.files).toEqual([small]); expect(first.notice).toContain('large.html')
  expect((await checkConsultFiles([large])).files).toEqual([large])
  expect(http).toHaveBeenCalledTimes(2)
})

it('does not stage files when the policy cannot be obtained', async () => {
  vi.mocked(http).mockRejectedValue(new Error('offline'))
  await expect(checkConsultFiles([new File(['a'], 'a.txt')])).rejects.toThrow('offline')
})
