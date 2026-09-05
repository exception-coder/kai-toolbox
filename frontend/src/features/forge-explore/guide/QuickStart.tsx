import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import connectionSource from './sessionClientExample.ts?raw'
import exchangeSource from './exchangeInvitationExample.ts?raw'
import { CodeSample } from './CodeSample'
import { SpringBootStart } from './SpringBootStart'

const buildCommands = `# 在 Forge 的 frontend/ 目录执行
npm run session-client:build

# 切换到你的前端接入项目，将下面路径替换为实际绝对路径
npm install "D:/path/to/kai-toolbox/frontend/dist-session-client"`
const environment = `# 应用部署环境配置（修改后重启 Forge）
FORGE_SESSION_CLIENT_ENABLED=true

# 仅跨域客户端需要：替换为客户端页面的完整 HTTPS Origin
FORGE_SESSION_CLIENT_ALLOWED_ORIGINS=https://your-app.example.com`
const sendExample = `// connection 是 connectParticipant(...) 的返回值。
// 在用户提交事件中执行，失败时保留草稿。
try {
  const commandId = await connection.client.send({ text: draft })
  // 此时仅拿到命令 ID，等待 commandAccepted / message / completed 事件。
  console.log('命令已发出', commandId)
} catch (error) {
  // 在宿主 UI 展示错误；不要自动再次调用 send()。
  console.error('请保留草稿并检查连接', error)
}

// 页面卸载时：
connection.dispose()`

function NoCodeStart() {
  return (
    <div className="guide-no-code">
      <ol className="guide-onboarding-steps">
        <li><span>01</span><div><h3>所有者创建邀请</h3><p>进入 Vibe Coding，创建或选择已有会话 →「委托」→ 选择 Forge 用户与能力画像 →「创建邀请」。当前页面默认授权 24 小时、30 轮、单条文字 64 KiB；这些是管理页默认值，不是协议固定上限。</p></div></li>
        <li><span>02</span><div><h3>参与者登录并配对</h3><p>将邀请码交给指定参与者。对方以自己的 Forge 账号登录，打开参与者页面并兑换邀请码；现有页面还遵循 Vibe Coding 菜单权限。邀请码最长 15 分钟有效且只能使用一次。</p></div></li>
        <li><span>03</span><div><h3>从一条业务需求开始</h3><p>确认绑定会话和剩余额度，发送一条非空需求。检查受理回执、消息与进度；业务问题由参与者回答，风险审批回到所有者管理端。</p></div></li>
      </ol>
      <div className="guide-actions"><Button asChild><Link to="/tools/claude-chat">前往会话委托<ArrowRight /></Link></Button><Button variant="outline" asChild><Link to="/session-client">打开参与者页面<ArrowRight /></Link></Button></div>
    </div>
  )
}

function SdkStart() {
  return (
    <div className="guide-sdk-start">
      <h3>1. 准备服务端与入口</h3>
      <p>启用 Forge 认证（toolbox.auth.enabled=true），准备所有者与指定参与者账号，并保持 Forge 和 Agent 服务可用。同源无需额外 CORS；跨域时允许精确 Origin，并将 REST 与 WebSocket 转发到同一 Forge 服务。</p>
      <CodeSample title="服务端环境配置" language="env" code={environment} />
      <h3>2. 构建并安装 SDK</h3>
      <p>当前交付为本地 ESM 包和类型声明。构建目录中的包名为 @kai/session-client；这里使用 file 安装，不假设它已发布到公共 npm。</p>
      <CodeSample title="构建与安装" language="PowerShell" code={buildCommands} />
      <h3>3. 登录、兑换、连接</h3>
      <p>先由所有者创建邀请。宿主负责 Forge 登录与邀请兑换，SDK 接收的是兑换后的会话授权令牌。下方两个 TypeScript 文件分别保存，再由宿主串联调用。</p>
      <CodeSample title="exchangeInvitation.ts" language="TypeScript" code={exchangeSource} />
      <details className="guide-disclosure" open><summary>连接示例 · 订阅、历史恢复与销毁</summary><CodeSample title="connectParticipant.ts" language="TypeScript" code={connectionSource.replaceAll("'@/session-client-sdk'", "'@kai/session-client'")} /></details>
      <p className="guide-note">调用顺序：exchangeInvitation(baseUrl, 参与者登录令牌, 邀请码) → connectParticipant({'{'} requestBaseUrl, grantId, accessToken, onEvent, onState, onHistory, onError {'}'})。回调由你的页面实现；onHistory 按消息 ID 合并，onEvent 处理增量文字与业务问题。</p>
      <details className="guide-disclosure"><summary>发送与卸载示例</summary><CodeSample title="用户提交事件" language="TypeScript" code={sendExample} /></details>
      <h3>4. 按结果验收接入</h3>
      <ul className="guide-checklist"><li>connect() 返回正确的固定会话；收到 ready 后展示就绪状态。</li><li>发送后出现 commandAccepted，再收到 message / progress；completed 只表示回合结束。</li><li>模拟断线、补读历史和令牌失效，检查草稿保留与重新授权入口。</li><li>所有者暂停或撤销后，参与者不能继续操作；风险审批仍在管理端。</li></ul>
    </div>
  )
}

export function QuickStart() {
  const [mode, setMode] = useState<'page' | 'sdk' | 'spring'>('page')
  return (
    <div>
      <div className="guide-switcher" role="group" aria-label="接入方式">
        <button type="button" aria-pressed={mode === 'page'} onClick={() => setMode('page')}>免开发体验</button>
        <button type="button" aria-pressed={mode === 'sdk'} onClick={() => setMode('sdk')}>SDK 接入</button>
        <button type="button" aria-pressed={mode === 'spring'} onClick={() => setMode('spring')}>Spring Boot Starter</button>
      </div>
      <p className="guide-note">免开发体验使用现有页面；SDK 接入由浏览器直连 Forge；Spring Boot Starter 由业务后端中继，浏览器只连接自己的业务服务。</p>
      {mode === 'page' ? <NoCodeStart /> : mode === 'sdk' ? <SdkStart /> : <SpringBootStart />}
    </div>
  )
}
