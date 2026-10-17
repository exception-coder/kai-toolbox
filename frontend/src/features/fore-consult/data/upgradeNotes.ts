export interface ConsultUpgradeNote {
  /** 稳定身份；更正同一更新时保留ID，新的重磅更新追加新记录。 */
  id: string
  date: string
  title: string
  /** 面向同事的一句变化与用法；未部署或未验收时在此注明。 */
  summary: string
}

/** 重磅更新登记处。保留历史；日期使用YYYY-MM-DD，页面仅展示最新五条。 */
export const CONSULT_UPGRADE_NOTES: readonly ConsultUpgradeNote[] = [
  {
    id: '2026-10-18-screenshot-question', date: '2026-10-18', title: '截图直接问',
    summary: '不用选系统、模块或填标题，直接描述问题、粘贴截图即可。',
  },
  {
    id: '2026-10-18-related-systems', date: '2026-10-18', title: '自动探索关联系统',
    summary: '先查你标记的系统，未找到就依次探索关联源码；确实无法定位时再询问地址。',
  },
  {
    id: '2026-10-18-question-draft', date: '2026-10-18', title: '回答时也能继续写',
    summary: '等待回答时可编写下一条问题、添加附件，回答结束后再发送。',
  },
  {
    id: '2026-10-18-drop-attachments', date: '2026-10-18', title: '附件拖入就能用',
    summary: '图片和文件可直接拖入首问或追问输入区，截图也可粘贴。',
  },
  {
    id: '2026-10-18-source-git', date: '2026-10-18', title: '源码与提交记录辅助定位',
    summary: '结合已接入源码与本地 Git 修改线索，帮助 IT 找到相关开发联系人。',
  },
]
