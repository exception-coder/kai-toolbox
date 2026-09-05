import { ArrowDown, ArrowRight, Monitor, Server, ShieldCheck, Terminal } from 'lucide-react'
import { responsibilityRows } from './delegationContent'

export function ResponsibilityDiagram() {
  return (
    <>
      <figure className="guide-architecture" aria-label="委托能力架构图">
        <figcaption>同一条会话，三个参与位置。</figcaption>
        <div className="guide-owner"><ShieldCheck size={18} /><strong>会话所有者</strong><span>创建授权 · 选择画像 · 风险审批 · 暂停与撤销</span></div>
        <div className="guide-owner-link"><ArrowDown size={16} /><span>控制权保留在 Forge 管理端</span></div>
        <div className="guide-architecture-main">
          <div className="guide-architecture-node"><Monitor size={20} /><h3>参与者客户端</h3><p>现有会话页 / 你的业务系统</p><ul><li>登录与邀请配对</li><li>输入、附件、问题回答</li><li>公开消息与进度展示</li></ul><code>@kai/session-client</code></div>
          <div className="guide-transport"><span>REST / WS</span><ArrowRight size={20} /><span>命令 →<br />← 公开事件</span></div>
          <div className="guide-architecture-node"><Server size={20} /><h3>Forge 服务端</h3><p>授权与协议的边界</p><ul><li>身份、额度、版本校验</li><li>命令回执与会话队列</li><li>历史、事件投影与审计</li></ul><code>绑定一人 · 一会话 · 一画像</code></div>
          <div className="guide-transport"><span>执行策略</span><ArrowRight size={20} /><span>固定画像 →<br />← 执行反馈</span></div>
          <div className="guide-architecture-node"><Terminal size={20} /><h3>Agent 运行环境</h3><p>在所有者配置的项目中工作</p><ul><li>按会话目标执行</li><li>业务问题返回参与者</li><li>风险操作交所有者审批</li></ul><code>Claude / Codex 会话</code></div>
        </div>
      </figure>
      <p className="guide-note">上图为直连模式。已有业务 Spring Boot 后端时，可以在客户端与 Forge 之间接入 Relay Starter，由业务后端映射身份并保管 Forge 凭据；见下方「快速接入 → Spring Boot Starter」。两种方式都需要 Forge 与 Agent 运行环境保持可用。</p>
    </>
  )
}

export function ResponsibilityComparison() {
  return (
    <div className="guide-responsibilities">
      <div className="guide-comparison-header"><span>工作环节</span><h3>服务端负责什么</h3><h3>客户端负责什么</h3></div>
      {responsibilityRows.map(([name, server, client]) => <div className="guide-comparison-row" key={name}><h4>{name}</h4><p><span className="guide-mobile-label">服务端</span>{server}</p><p><span className="guide-mobile-label">客户端</span>{client}</p></div>)}
      <div className="guide-profiles">
        <article><code>DELEGATED_DEVELOPMENT</code><h3>受约束开发</h3><p>Agent 在绑定项目内推进工作；需要审批的工具仍交给所有者。参与者只通过公开命令参与。</p></article>
        <article><code>REQUEST_ONLY</code><h3>仅提交与澄清需求</h3><p>让业务先说清楚需求，实际写操作由所有者接管。不能通过提示词把授权升级为开发权限。</p></article>
      </div>
    </div>
  )
}
