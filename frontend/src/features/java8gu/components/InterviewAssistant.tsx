import { BriefcaseBusiness, Flame, Lightbulb, TriangleAlert } from 'lucide-react'
import type { KnowledgeInterview } from '../api/knowledgeApi'

export function InterviewAssistant({ interviews }: { interviews: KnowledgeInterview[] }) {
  const card = interviews[0]
  if (!card) {
    return <div className="rounded-lg border border-dashed p-4 text-sm text-[var(--color-muted-foreground)]">该节点暂未配置面试卡片。</div>
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-orange-500" />面试重点</div>
      <p className="text-sm font-medium">{card.question}</p>
      <AssistantSection icon={<Lightbulb className="h-4 w-4" />} title="30 秒回答" text={card.shortAnswer} />
      <AssistantSection icon={<TriangleAlert className="h-4 w-4" />} title="深入原理" text={card.detailAnswer} />
      <AssistantSection icon={<BriefcaseBusiness className="h-4 w-4" />} title="项目经验" text={card.projectAnswer} />
    </div>
  )
}

function AssistantSection({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <section className="rounded-lg bg-[var(--color-muted)]/35 p-3"><h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)]">{icon}{title}</h3><p className="text-sm leading-6">{text}</p></section>
}
