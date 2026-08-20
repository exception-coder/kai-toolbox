import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildPreviewFileUrl, HtmlPreview } from './HtmlPreview'

afterEach(cleanup)

describe('HtmlPreview', () => {
  it('把文件路径编码为预览资源地址', () => {
    expect(buildPreviewFileUrl('loc_a/b', '设计/原型 页面/index.html', 123)).toBe(
      '/api/doc-viewer/local/sources/loc_a%2Fb/preview/%E8%AE%BE%E8%AE%A1/%E5%8E%9F%E5%9E%8B%20%E9%A1%B5%E9%9D%A2/index.html?v=123',
    )
  })

  it('只给 iframe 开放脚本能力', () => {
    const { container } = render(
      <HtmlPreview sourceId="loc_test" filePath="demo.html" revision={456} dirty={false} />,
    )
    const iframe = container.querySelector('iframe')

    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe?.getAttribute('src')).toBe(
      '/api/doc-viewer/local/sources/loc_test/preview/demo.html?v=456',
    )
  })

  it('编辑后提示保存才能刷新预览', () => {
    const { getByText } = render(
      <HtmlPreview sourceId="loc_test" filePath="demo.html" revision={456} dirty />,
    )

    expect(getByText('预览显示已保存版本，保存文件后自动刷新')).not.toBeNull()
  })
})
