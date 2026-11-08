import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { ImageHostPage } from './ImageHostPage'
import { listImageHosts, recentImages, saveImageHost, uploadImage, type HostProfile } from './api'

vi.mock('./api', () => ({ listImageHosts: vi.fn(), recentImages: vi.fn(), saveImageHost: vi.fn(), deleteImageHost: vi.fn(), uploadImage: vi.fn() }))
const profile: HostProfile = { id: 'host-1', credentialsConfigured: true, isDefault: true, settings: {
  name: '团队截图', provider: 'GITHUB', endpoint: '', region: '', bucket: '', prefix: 'images', publicBaseUrl: '', repository: 'team/images', branch: 'main', pathStyle: false,
} }
const mount = () => render(<ConfirmProvider><ImageHostPage /></ConfirmProvider>)
beforeEach(() => { vi.clearAllMocks(); vi.mocked(listImageHosts).mockResolvedValue([profile]); vi.mocked(recentImages).mockResolvedValue([]) })
afterEach(() => { cleanup(); sessionStorage.clear() })

it('保存配置不会上传，编辑空凭据保留且不回填明文', async () => {
  vi.mocked(saveImageHost).mockResolvedValue(profile)
  mount()
  fireEvent.click(await screen.findByRole('button', { name: '编辑当前图床' }))
  const token = screen.getByLabelText('GitHub Token')
  expect(token).toHaveValue('')
  fireEvent.submit(screen.getByRole('form', { name: '图床配置' }))
  await waitFor(() => expect(saveImageHost).toHaveBeenCalledWith('host-1', expect.objectContaining({ secret: '', accessKey: '' })))
  expect(uploadImage).not.toHaveBeenCalled()
})

it('选择文件不立即发送，点击上传后复制返回的 Markdown', async () => {
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const receipt = { requestId: 'result', profileId: 'host-1', objectKey: 'images/key.png', fileName: 'screen.png', url: 'https://images.example.com/key.png', state: 'SUCCESS', markdown: '![screen](<https://images.example.com/key.png>)' }
  vi.mocked(uploadImage).mockResolvedValue(receipt)
  mount()
  const file = new File(['image'], 'screen.png', { type: 'image/png' })
  fireEvent.change(await screen.findByLabelText('选择要上传的图片'), { target: { files: [file] } })
  expect(uploadImage).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '上传到团队截图' }))
  await waitFor(() => expect(uploadImage).toHaveBeenCalledWith('host-1', file, expect.any(String)))
  fireEvent.click(await screen.findByRole('button', { name: '复制 Markdown' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(receipt.markdown))
})

it('上传未知时保留文件和草稿状态，不自动重试', async () => {
  vi.mocked(uploadImage).mockRejectedValue(new Error('请先到图床核对'))
  mount()
  fireEvent.paste(await screen.findByRole('region', { name: '图片上传区域' }), { clipboardData: { files: [new File(['png'], 'keep.png', { type: 'image/png' })] } })
  fireEvent.click(screen.getByRole('button', { name: '上传到团队截图' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('核对')
  expect(screen.getByText(/keep.png.*结果待核对/)).toBeTruthy()
  expect(screen.getByRole('button', { name: '上传到团队截图' })).toBeDisabled()
  expect(uploadImage).toHaveBeenCalledTimes(1)
})

it('错误保留配置表单，切换提供方清空凭据', async () => {
  vi.mocked(saveImageHost).mockRejectedValue(new Error('配置不可用'))
  mount(); fireEvent.click(await screen.findByRole('button', { name: '新增图床' }))
  fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: '保留名称' } })
  fireEvent.change(screen.getByLabelText('AccessKey Secret'), { target: { value: 'temporary-secret' } })
  fireEvent.submit(screen.getByRole('form', { name: '图床配置' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('配置不可用')
  expect(screen.getByLabelText('配置名称')).toHaveValue('保留名称')
  const requestId = vi.mocked(saveImageHost).mock.calls[0][1].creationId
  expect(sessionStorage.getItem('forge:image-host:pending-creation')).toBe(requestId)
  expect(sessionStorage.getItem('forge:image-host:pending-creation')).not.toContain('temporary-secret')
  fireEvent.submit(screen.getByRole('form', { name: '图床配置' }))
  await waitFor(() => expect(saveImageHost).toHaveBeenCalledTimes(2))
  expect(vi.mocked(saveImageHost).mock.calls[1][1].creationId).toBe(requestId)
  fireEvent.change(screen.getByLabelText('图床类型'), { target: { value: 'GITHUB' } })
  expect(screen.getByLabelText('GitHub Token')).toHaveValue('')
})

it('拒绝不支持文件，不以本地路径冒充图床链接', async () => {
  mount()
  fireEvent.drop(await screen.findByRole('region', { name: '图片上传区域' }), { dataTransfer: { files: [new File(['svg'], 'unsafe.svg', { type: 'image/svg+xml' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('其他文件未加入')
  expect(uploadImage).not.toHaveBeenCalled()
})
