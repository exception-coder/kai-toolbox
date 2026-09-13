/** 已由项目库接管的配置块；保留原 API 和持久化键。 */
export const PROJECT_DIRECTORY_BLOCKS = {
  workspace: 'toolbox.claude-chat.workspace',
  projects: 'toolbox.projects',
  managed: 'toolbox.claude-chat.business-workspace',
} as const

export const PROJECT_DIRECTORY_SETTINGS_URL = '/tools/project-workspace?section=directories'

export function isProjectDirectoryBlock(id: string | null) {
  return Object.values(PROJECT_DIRECTORY_BLOCKS).some(block => block === id)
}
