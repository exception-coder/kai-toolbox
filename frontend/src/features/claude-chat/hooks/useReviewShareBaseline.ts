import { useEffect, useState } from 'react'
import { getContent, getInitialSpecContent, type PrdSessionView } from '@/features/prd-clarify/public-api'
import { fetchProjectModules, listWorkspaces } from '../api'
import type { ProjectModule, ProjectModules, WorkspaceDir } from '../types'

export interface ReviewShareBaselineState {
  loading: boolean
  project: ProjectModules | null
  modules: ProjectModule[]
  matchedModule: ProjectModule | null
  initialSpecification: string
  coreSpecification: string
  warnings: string[]
}

const EMPTY_STATE: ReviewShareBaselineState = {
  loading: true,
  project: null,
  modules: [],
  matchedModule: null,
  initialSpecification: '',
  coreSpecification: '',
  warnings: [],
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function containsPath(parent: string, child: string): boolean {
  const normalizedParent = normalizePath(parent)
  const normalizedChild = normalizePath(child)
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`)
}

function flattenModules(modules: ProjectModule[]): ProjectModule[] {
  return modules.flatMap(module => [module, ...flattenModules(module.children ?? [])])
}

function modulePaths(module: ProjectModule): string[] {
  return [module.absPath, module.codePath, module.webPath, ...(module.webPaths ?? [])].filter(Boolean) as string[]
}

function findWorkspaceProject(cwd: string, projects: WorkspaceDir[]): WorkspaceDir | null {
  return projects
    .filter(project => containsPath(project.path, cwd))
    .sort((left, right) => normalizePath(right.path).length - normalizePath(left.path).length)[0] ?? null
}

function findMatchedModule(cwd: string, modules: ProjectModule[]): ProjectModule | null {
  const exact = modules.find(module => modulePaths(module).some(path => normalizePath(path) === normalizePath(cwd)))
  if (exact) return exact
  return modules
    .filter(module => modulePaths(module).some(path => containsPath(path, cwd) || containsPath(cwd, path)))
    .sort((left, right) => Math.max(...modulePaths(right).map(path => normalizePath(path).length))
      - Math.max(...modulePaths(left).map(path => normalizePath(path).length)))[0] ?? null
}

/** 聚合模块目录、初始化规格与核心规格；展示组件只消费这一份用例状态。 */
export function useReviewShareBaseline(cwd: string, linkedPrd?: PrdSessionView | null): ReviewShareBaselineState {
  const [state, setState] = useState<ReviewShareBaselineState>(EMPTY_STATE)

  useEffect(() => {
    let cancelled = false
    setState(EMPTY_STATE)
    const load = async () => {
      const warnings: string[] = []
      let project: ProjectModules | null = null
      let modules: ProjectModule[] = []
      let matchedModule: ProjectModule | null = null
      try {
        const workspaces = await listWorkspaces()
        const workspaceProject = findWorkspaceProject(
          cwd,
          workspaces.roots.filter(root => root.exists).flatMap(root => root.dirs),
        )
        if (workspaceProject) {
          project = await fetchProjectModules(workspaceProject.path)
          modules = flattenModules(project.modules)
          matchedModule = findMatchedModule(cwd, modules)
          if (!project.fromKnowledge) warnings.push('项目尚未使用 modules.json 模块定义，当前模块来自目录扫描。')
          if (!matchedModule) warnings.push('当前会话目录未唯一命中模块，请在分享前手动确认模块。')
        } else {
          warnings.push('当前会话目录未匹配已配置的工作区项目。')
        }
      } catch (error) {
        warnings.push(error instanceof Error ? `模块定义读取失败：${error.message}` : '模块定义读取失败。')
      }

      let initialSpecification = ''
      let coreSpecification = ''
      if (linkedPrd) {
        const [initialResult, coreResult] = await Promise.allSettled([
          getInitialSpecContent(linkedPrd.id),
          getContent(linkedPrd.id),
        ])
        if (initialResult.status === 'fulfilled') initialSpecification = initialResult.value.trim()
        else warnings.push('关联规格的初始化规格读取失败，将使用会话需求作为降级基线。')
        if (coreResult.status === 'fulfilled') coreSpecification = coreResult.value.trim()
        else warnings.push('关联规格的核心规格读取失败，评审回答不能引用核心索引。')
        if (!initialSpecification) warnings.push('关联规格尚无可用初始化规格。')
        if (!coreSpecification) warnings.push('关联规格尚无可用核心规格。')
      } else {
        warnings.push('当前开发会话未关联规格，无法自动带入初始化规格与核心索引。')
      }
      if (!cancelled) setState({ loading: false, project, modules, matchedModule,
        initialSpecification, coreSpecification, warnings })
    }
    void load()
    return () => { cancelled = true }
  }, [cwd, linkedPrd])

  return state
}
