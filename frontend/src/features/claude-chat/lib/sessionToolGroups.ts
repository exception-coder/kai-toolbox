/** 分类仅描述入口用途；操作、对象及权限仍由现有工作区持有。 */
export const SESSION_TOOL_GROUPS = {
  navigation: { label: '工作与进度', hint: '待办、看板、轨迹、站点与用量' },
  workspace: { label: '文件与项目', hint: '目录、Git 变更与项目准备' },
  session: { label: '会话与分享', hint: '提问、命名、导出与规格关联' },
  view: { label: '阅读与显示', hint: '外观、专注模式与通知偏好' },
  system: { label: '运行与维护', hint: 'Agent、连接、依赖与故障排查' },
} as const
export type SessionToolGroupId = keyof typeof SESSION_TOOL_GROUPS
