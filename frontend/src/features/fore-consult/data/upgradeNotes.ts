export interface ConsultUpgradeNote {
  /** 稳定身份；更正同一更新时保留ID，新的重磅更新追加新记录。 */
  id: string
  date: string
  title: string
  summary: string
  changes: readonly { title: string; detail: string }[]
  scope: string
}

/** 重磅更新登记处。保留历史；日期使用YYYY-MM-DD，页面按日期倒序展示。 */
export const CONSULT_UPGRADE_NOTES: readonly ConsultUpgradeNote[] = [{
  id: '2026-10-18-consult-autonomy',
  date: '2026-10-18',
  title: '业务咨询升级',
  summary: '直接发问题或截图，Forge 先自主定位，再根据证据回答。',
  changes: [
    { title: '截图直接问', detail: '不必先选系统、模块或填写标题；描述问题、粘贴截图即可开始。' },
    { title: '关联系统自动找', detail: '点击图谱只决定先查哪里。未命中会继续探索关联系统，确实无法判断时再请你补充地址。' },
    { title: '边等边准备', detail: 'AI 回答时仍能输入下一条问题、添加附件；当前回答结束后再发送，草稿会保留。' },
    { title: '附件直接拖入', detail: '截图可粘贴，图片和文件可直接拖入首问或追问输入区。' },
    { title: '定位更有依据', detail: '结合已接入源码核查页面逻辑，查询本地 Git 提交与修改线索，帮助 IT 找到相关开发联系人。' },
  ],
  scope: '可用证据取决于已接入的源码和数据资源；无法确认会说明缺口，业务数据仍只读。',
}]

export function formatUpgradeNote(note: ConsultUpgradeNote): string {
  return [
    `${note.title}｜${note.date}`, note.summary, '',
    ...note.changes.map((change, index) => `${index + 1}. ${change.title}：${change.detail}`),
    '', note.scope,
  ].join('\n')
}
