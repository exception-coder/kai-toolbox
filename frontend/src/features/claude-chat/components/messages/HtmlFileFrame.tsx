/**
 * 会话中的本地 HTML 只在无同源权限的沙箱中渲染：脚本可运行以支持图表和交互，
 * 但页面拿不到 Forge 的登录态、Cookie、存储和父页面 DOM，也不能提交表单或跳转顶层窗口。
 * 相对路径资源（同目录的 css/js/图片）不会加载；自包含页面或 CDN 资源可正常显示。
 */
export function HtmlFileFrame({ content, title, className }: { content: string; title: string; className?: string }) {
  return <iframe title={title} srcDoc={content} sandbox="allow-scripts allow-popups" referrerPolicy="no-referrer"
    className={className ?? 'block size-full border-0 bg-white'} />
}
