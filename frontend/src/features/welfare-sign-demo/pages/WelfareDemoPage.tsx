import { WelfareSignPage } from '@/features/welfare-sign/pages/WelfareSignPage'

/**
 * 福利签收页的「免登录公开复刻」。
 *
 * 直接复用真实的 {@link WelfareSignPage}（fullscreen 模式 = 端午安康 + 确认身份对话框的签收页），
 * 只是挂在 showcase 布局下（无 AppShell / 无 RouteGuard），因此**无需登录**即可打开并弹出确认身份对话框、
 * 走 mock 登录（13800000000 / 000000）完成签收演示。页面与原版一模一样，不复制一行 UI 代码。
 */
export function WelfareDemoPage() {
  return <WelfareSignPage fullscreen />
}
