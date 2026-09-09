import type { ProfileAsset } from './types'

export const assetLabels: Record<ProfileAsset['kind'], string> = {
  PROJECT: '项目基础画像', CODE: '代码结构与关系', SEMANTIC: '业务语义登记',
  EXECUTION: '开发执行规范', VERIFICATION: '验证策略与入口',
}

export const stageDescriptions: Record<string, { label: string; check: string; output: string; purpose: string }> = {
  repository: { label: '代码仓库扫描', check: '工程文件、技术栈、构建配置及 Git 提交和分支。', output: '记录工程结构与源码指纹。', purpose: '确定 AI 工作范围，识别后续代码变化。' },
  environment: { label: '环境配置检查', check: '项目环境配置和 Forge 宿主运行环境。', output: '收集环境信息；当前不会自动安装依赖、启动项目或检查运行实例。', purpose: '为后续准备开发环境提供依据，暴露尚未核验的部分。' },
  graphify: { label: '代码图谱检查与构建', check: 'Graphify 图谱是否可用、是否覆盖当前源码。', output: '完整初始化时，图谱缺失或过期会在工具与资源允许时尝试构建；同步画像仅检查。', purpose: '帮助 AI 查找代码、调用关系和影响范围。' },
  semantic: { label: '业务语义分析', check: '已有 OpenSpec 业务规格和领域知识来源。', output: '登记现有业务语义入口；自动归纳业务域属于后续阶段。', purpose: '让 AI 按业务规则理解需求，而不只依赖代码名称。' },
  mapping: { label: '页面、接口与数据库关联', check: '现有图谱与规格中可用于定位页面、接口和数据结构的入口。', output: '当前保留关联线索，尚不自动生成完整映射；接口和真实表结构需另行核验。', purpose: '为从业务问题追踪到代码和数据提供依据。' },
  verification: { label: '验证入口发现', check: '构建、测试命令以及已有验证规则。', output: '记录可用验证入口和缺口；发现命令不代表已经执行或通过。', purpose: '指导代码修改后如何验证结果。' },
  profile: { label: '系统画像汇总', check: '五类资产的证据、缺口及扫描前后的源码一致性。', output: '发布带版本和源码指纹的系统画像，保留待补齐事项。', purpose: '让后续任务复用系统上下文，并判断何时需要同步。' },
}

export function assetTitle(asset: ProfileAsset): string {
  return `${assetLabels[asset.kind]}（${asset.title}）`
}
