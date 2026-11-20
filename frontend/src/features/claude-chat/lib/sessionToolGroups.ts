/** 分类按「想做什么」命名，仅描述入口用途；操作、对象及权限仍由现有工作区持有。 */
export const SESSION_TOOL_GROUPS = {
  navigation: { label: '进度与看板', hint: '对话、推进、看板与自动监督' },
  workspace: { label: '代码与项目', hint: '工作目录、Git 变更与附加项目' },
  session: { label: '回看与分享', hint: '我的提问、导出、共享与评审' },
  engine: { label: '引擎与连接', hint: '切换引擎、引擎更新、服务商与能力' },
  view: { label: '显示与偏好', hint: '外观、专注模式与通知' },
  system: { label: '维护与排障', hint: '团队依赖、日志、调试与重启' },
} as const
export type SessionToolGroupId = keyof typeof SESSION_TOOL_GROUPS
