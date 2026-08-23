import { describe, expect, it, vi } from 'vitest'
import {
  prepareConsultAttachments,
  type ConsultDraftAttachment,
} from './consultAttachmentDispatch'

function draft(overrides: Partial<ConsultDraftAttachment> = {}): ConsultDraftAttachment {
  return {
    name: 'screen.png',
    path: 'draft:1',
    mime: 'image/png',
    file: new File(['image'], 'screen.png', { type: 'image/png' }),
    ...overrides,
  }
}

describe('consult attachment dispatch', () => {
  it('上传草稿并记录目标会话归属', async () => {
    const attachment = draft()
    const uploader = vi.fn().mockResolvedValue({
      id: 'att-1', name: 'screen.png', path: 'C:/workspace/.kai-chat-attachments/session-1/screen.png',
      mime: 'image/png', size: 5,
    })

    const prepared = await prepareConsultAttachments('session-1', [attachment], uploader)

    expect(uploader).toHaveBeenCalledOnce()
    expect(attachment.uploadedSessionId).toBe('session-1')
    expect(prepared[0].path).toContain('/session-1/')
  })

  it('同会话重试跳过已成功附件', async () => {
    const attachment = draft({
      path: 'C:/workspace/.kai-chat-attachments/session-1/screen.png',
      uploadedSessionId: 'session-1',
    })
    const uploader = vi.fn()

    await prepareConsultAttachments('session-1', [attachment], uploader)

    expect(uploader).not.toHaveBeenCalled()
  })

  it('附件进入新咨询时重新上传到新会话', async () => {
    const attachment = draft({
      path: 'C:/workspace/.kai-chat-attachments/session-old/screen.png',
      uploadedSessionId: 'session-old',
    })
    const uploader = vi.fn().mockResolvedValue({
      id: 'att-2', name: 'screen.png', path: 'C:/workspace/.kai-chat-attachments/session-new/screen.png',
      mime: 'image/png', size: 5,
    })

    await prepareConsultAttachments('session-new', [attachment], uploader)

    expect(uploader).toHaveBeenCalledWith('session-new', attachment.file)
    expect(attachment.uploadedSessionId).toBe('session-new')
  })

  it('需要跨会话上传但缺少原始文件时明确拒绝', async () => {
    const attachment = draft({ file: undefined, uploadedSessionId: 'session-old' })

    await expect(prepareConsultAttachments('session-new', [attachment], vi.fn()))
      .rejects.toThrow('缺少原始文件')
  })
})
