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
    id: '2026-10-18-host-sftp', date: '2026-10-18', title: '主机文件支持 SFTP 传输',
    summary: '待部署验收：管理员从主机管理的“SFTP 文件”浏览、下载、上传；替换先核对原文件并保留备份。支持提供 SFTP 的 Linux/Windows 主机，单文件20 MiB。',
  },
  {
    id: '2026-10-18-business-autofill', date: '2026-10-18', title: '业务输入防误填',
    summary: '区分业务输入与登录字段，减少账号被误填为问题标题或筛选条件；代码已修正，真实浏览器待验证。',
  },
  {
    id: '2026-10-18-consult-history-reading', date: '2026-10-18', title: '历史咨询直接阅读原对话',
    summary: '历史优先打开原会话；已归档只读，进行中可追问。手机旧归档全宽阅读，普通用户菜单精简。移动浏览器待验收。',
  },
  {
    id: '2026-10-18-mobile-new-consult', date: '2026-10-18', title: '新咨询无需先归档',
    summary: '手机和平板可点顶部“新建”准备另一项问题，原咨询从历史继续；页面内草稿分别保留。移动浏览器待验收。',
  },
  {
    id: '2026-10-18-home-navigation', date: '2026-10-18', title: '首页先显示功能菜单',
    summary: '已有登录快照时，首页先显示有权访问的功能入口，再加载完整工作台；可直接进入业务系统咨询。其他同事环境待更新验收。',
  },
  {
    id: '2026-10-18-consult-release-evaluation-optional', date: '2026-10-18', title: '流程候选可直接发布',
    summary: '待部署验收：管理员保存咨询流程候选后可直接发布，评测仅供参考；数据库只读与系统绑定限制保持。',
  },
  {
    id: '2026-10-18-mobile-consult-workspace', date: '2026-10-18', title: '手机咨询更顺手',
    summary: '新版前端默认进入咨询，可切换系统图谱；点输入区全屏编辑，附件折叠收纳。',
  },
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
