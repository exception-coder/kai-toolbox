// 章节标题 → emoji 图标推断（卡片视图小节标题前的视觉锚点）
//
// 早期这里还提供过 buildMindmap，把 ParsedStructure 转成 mermaid mind map 源码；
// 后来卡片视图改造彻底放弃了 mermaid，只保留这一份关键词命中图标的小规则表。

interface IconRule {
  pattern: RegExp
  icon: string
}

const RULES: IconRule[] = [
  { pattern: /(典型回答|回答|总结|核心要点|结论)/, icon: '🎯' },
  { pattern: /(原理|实现|底层|机制|工作原理)/, icon: '⚙️' },
  { pattern: /(优化|调优|性能|提速)/, icon: '🚀' },
  { pattern: /(问题|风险|坑|陷阱|缺点|劣势)/, icon: '⚠️' },
  { pattern: /(优点|好处|优势|价值)/, icon: '✨' },
  { pattern: /(场景|应用|案例|实践|举例)/, icon: '🎬' },
  { pattern: /(对比|区别|VS|比较|差异)/, icon: '⚖️' },
  { pattern: /(如何|怎么|方法|步骤|方式|流程)/, icon: '📋' },
  { pattern: /(为什么|原因)/, icon: '❓' },
  { pattern: /(什么是|定义|概念)/, icon: '📖' },
  { pattern: /(源码|代码|示例)/, icon: '💻' },
  { pattern: /(安全|攻击|漏洞|防御)/, icon: '🛡️' },
  { pattern: /(配置|参数|设置)/, icon: '🔧' },
  { pattern: /(数据|表|存储|缓存)/, icon: '🗄️' },
  { pattern: /(并发|线程|锁|同步)/, icon: '🔀' },
  { pattern: /(网络|协议|连接|TCP|HTTP)/, icon: '🌐' },
  { pattern: /(速记|要点|卡片)/, icon: '📝' },
]

export function iconFor(text: string): string {
  for (const r of RULES) {
    if (r.pattern.test(text)) return r.icon
  }
  return '·'
}
