/**
 * 睿程 ERP 系统全景图 —— 忠实复刻原始单文件 HTML（自带 <style>/<script>/字体）。
 * 用全屏 iframe 加载 public/showcase/ruicheng-erp.html，让其 CSS/JS 与主应用完全隔离、
 * 像素级还原；后期直接改那个 HTML 即可，无需动 React 代码。
 */
export function ErpOverviewPage() {
  return (
    <iframe
      src="/showcase/ruicheng-erp.html"
      title="睿程 ERP 系统全景图"
      className="block h-screen w-full border-0"
    />
  )
}
