import { ArrowDown, ArrowRight, CornerUpLeft, ClipboardList, HardHat, Hammer } from 'lucide-react'

export function ExecutionOverview() {
  return <figure className="execution-overview" id="guide-main" aria-label="OpenSpec 与 Forge 完整执行流程">
    <figcaption>就像按图施工：有图纸，有人干活，也有人盯进度。</figcaption>
    <div className="execution-owner"><strong>你是项目负责人</strong><span>说清要什么、什么算做好，关键决定由你拍板。</span><ArrowDown size={18} aria-hidden="true" /></div>
    <div className="execution-cast" aria-hidden="true"><ClipboardList size={36} strokeWidth={1.3} /><HardHat size={36} strokeWidth={1.3} /><Hammer size={36} strokeWidth={1.3} /></div>
    <div className="execution-flow">
      <div className="execution-node"><small>第一步 · 写清楚</small><h2>📋 一份施工单</h2><p>把口头要求写下来：做什么、分几步、怎么验收。</p><footer>OpenSpec · 保存需求与任务</footer></div>
      <ArrowRight className="execution-arrow" size={22} aria-label="读取任务" />
      <div className="execution-node"><small>第二步 · 安排工作</small><h2>一位项目监工</h2><p>记住这份施工单，安排下一项工作，持续盯进度。</p><footer>Forge · 记录、派工与监督</footer></div>
      <ArrowRight className="execution-arrow" size={22} aria-label="派发当前任务" />
      <div className="execution-node"><small>第三步 · 动手做</small><h2>一名 AI 施工员</h2><p>照着要求写代码、跑测试，把结果交回来。</p><footer>Agent · 只能使用获准的工具</footer></div>
    </div>
    <div className="execution-return"><ArrowDown size={20} aria-hidden="true" /><span>“这一项做到了这里，这是检查结果。”</span></div>
    <div className="execution-check"><small>第四步 · 对单检查</small><h2>不能只听“做好了”，还要看检查结果。</h2><p>监工核对任务记录，并调用配置好的检查工具。</p></div>
    <div className="execution-outcomes">
      <div><CornerUpLeft size={20} aria-hidden="true" /><strong>还有活，或没做对</strong><p>回到监工 → 继续派工或返工</p><small>在约定的时间和轮次内继续</small></div>
      <div><ArrowDown size={20} aria-hidden="true" /><strong>拿不准，或需要你拍板</strong><p>先停下来 → 找你处理 → 再继续</p><small>风险操作、缺少条件或预算用尽</small></div>
      <div><ArrowDown size={20} aria-hidden="true" /><strong>清单做完，检查通过</strong><p>按你的授权收尾，留下记录</p><small>真实业务是否满意，仍由你验收</small></div>
    </div>
    <p className="execution-boundary">施工单不会让施工员永远不犯错。它让要求有据可查，再通过检查、返工和人工验收减少偏差。</p>
  </figure>
}
