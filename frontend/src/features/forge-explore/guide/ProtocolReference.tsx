import { publicEndpoints, recoveryItems, sdkMethods } from './delegationContent'

export function ProtocolReference() {
  return (
    <div className="guide-reference">
      <h3>SDK 公共方法</h3>
      <dl className="guide-methods">{sdkMethods.map(([method, explanation]) => <div key={method}><dt><code>{method}</code></dt><dd>{explanation}</dd></div>)}</dl>
      <details className="guide-disclosure"><summary>查看 REST / WebSocket 接口</summary>
        <p>公共前缀：<code>/api/session-client/v1</code>。REST 使用 Authorization: Bearer；长效凭据不放进 URL。</p>
        <div className="guide-table-scroll" tabIndex={0} role="region" aria-label="公共接口表，可横向滚动"><table><thead><tr><th>方式</th><th>路径</th><th>凭据</th><th>结果</th></tr></thead><tbody>{publicEndpoints.map(([method, path, credential, result]) => <tr key={path}><td>{method}</td><td><code>{path}</code></td><td>{credential}</td><td>{result}</td></tr>)}</tbody></table></div>
        <p>所有者管理前缀：<code>/api/claude-chat/sessions/{'{sessionId}'}/delegations</code>。支持 POST 创建、GET 列表、POST /{'{grantId}'}/pause、POST /{'{grantId}'}/resume、DELETE /{'{grantId}'}、POST /{'{grantId}'}/invitation、GET /{'{grantId}'}/audit。暂停、恢复和撤销携带 expectedVersion。</p>
      </details>
      <details className="guide-disclosure"><summary>如何理解事件与执行结果</summary>
        <dl className="guide-methods"><div><dt><code>ready / commandAccepted</code></dt><dd>会话就绪 / 命令受理，均不表示开发完成。</dd></div><div><dt><code>message / progress</code></dt><dd>公开文字与执行进度。助手消息可能是增量片段；不要把每个片段都当作一条完整消息。</dd></div><div><dt><code>businessQuestion</code></dt><dd>需要业务确认，携带 requestId；由接入方收集并返回答案。</dd></div><div><dt><code>completed</code></dt><dd>回合结束，检查 stopReason 与产出；业务验收由使用者确认。</dd></div><div><dt><code>replayGap / error</code></dt><dd>历史缺口或失败。读取 error.code、message、retryable，保留当前上下文并提供恢复动作。</dd></div></dl>
        <p className="guide-note">公开协议过滤内部工具、路径字段和管理事件；可见消息正文仍是业务内容，接入方应按业务数据保护要求展示和保存。类型中预留的 blocked 不能当作唯一的阻塞信号，应同时处理 error 与 progress。</p>
      </details>
    </div>
  )
}

export function RecoveryReference() {
  return (
    <>
      <div className="guide-lifecycle" aria-label="授权生命周期"><span>ACTIVE</span><span>⇄</span><span>PAUSED</span><span>→</span><span>REVOKED / EXPIRED</span></div>
      <p className="guide-note">ACTIVE 可暂停或撤销，PAUSED 可恢复或撤销；有效期届满即失效。撤销和过期是终态。授权状态与 Agent 回合状态分别管理。</p>
      <div className="guide-recovery">{recoveryItems.map(([title, code, description]) => <details key={title}><summary>{title}</summary><code>{code}</code><p>{description}</p></details>)}</div>
      <aside className="guide-validation"><h3>当前接入边界</h3><p>SDK 不创建任意会话，不持有模型密钥，不提供风险审批或令牌自动续期。多个授权共用同一 Origin 时，应像示例一样隔离 storage；销毁实例不会自动删除已保存的待确认命令。</p><p>说明依据当前实现与 SDK 契约整理。完整 Agent 端到端链路、企业 HTTPS/WSS 入口仍需在目标环境验收；本文中的步骤与图解不等于这些环境已通过验收。</p></aside>
    </>
  )
}
