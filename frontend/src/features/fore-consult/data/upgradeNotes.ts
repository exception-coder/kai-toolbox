export interface ConsultUpgradeNote {
  /** 稳定身份；更正同一更新时保留ID，新的重磅更新追加新记录。 */
  id: string
  date: string
  title: string
  /** 面向同事的一句变化与用法；未部署或未验收时在此注明。 */
  summary: string
}

/** 重磅更新登记处。保留历史；日期使用YYYY-MM-DD，同日新增记录会重新提示纸签。 */
export const CONSULT_UPGRADE_NOTES: readonly ConsultUpgradeNote[] = [
  {
    id: '2026-10-18-screenshot-question', date: '2026-10-18', title: '截图即可提问',
    summary: '直接粘贴截图，Forge 自动定位相关系统。',
  },
  {
    id: '2026-10-18-related-systems', date: '2026-10-18', title: '自动定位相关系统',
    summary: '先查标记系统，再依次探索关联源码；确实无法定位时再询问地址。',
  },
  {
    id: '2026-10-18-question-draft', date: '2026-10-18', title: '支持连续追问',
    summary: '回答时可准备下一条问题和附件，回答结束后再发送。',
  },
  {
    id: '2026-10-18-drop-attachments', date: '2026-10-18', title: '支持拖入附件',
    summary: '图片和文件直接拖入输入区，截图也可粘贴。',
  },
  {
    id: '2026-10-18-source-git', date: '2026-10-18', title: '源码与提交记录辅助定位',
    summary: '结合已接入源码与本地 Git 修改线索，帮助 IT 找到相关开发联系人。',
  },
]
