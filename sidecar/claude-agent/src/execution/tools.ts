import { abortExecutionSchema, discoverExecutionSchema, assessExecutionSchema, executionCheckSchema, executionContextSchema, runExecutionSchema, resolveContextSchema, executionEventSchema } from './contracts.js'
import { discoverExecution, resolveContext } from './context.js'
import { abortExecution, assessExecution, checkExecution, finishExecution, inspectExecutionWriter } from './service.js'
import { runExecutionVerification } from './verification.js'
import { initSession } from './session.js'
import { checkExecutionEvent } from './lifecycle.js'
import { commitExecution, commitExecutionSchema } from './commit.js'
import { inspectStoreLock, recoverStoreLock, inspectStoreSchema, recoverStoreSchema } from './storeRecovery.js'

export const executionDefinitions = [
  { name: 'commit_execution', schema: commitExecutionSchema, run: commitExecution,
    description: '按本执行范围提交已验证内容；需先 inspect_execution_writer 核对 executionId/HEAD/scopeFingerprint 并审阅差异，传完整提交消息。使用 Git --only 保留其他任务暂存内容，执行真实 hooks，不推送、不释放 writer。重试相同成功请求返回原提交；结果未知时先核对历史，不能盲目重试。' },
  { name: 'inspect_store_lock', schema: inspectStoreSchema, run: inspectStoreLock,
    description: '只读查询内部存储锁及现场摘要；不以超时判断锁失效。' },
  { name: 'recover_store_lock', schema: recoverStoreSchema, run: recoverStoreLock,
    description: '旧版无身份锁的审计恢复。仅在操作者确认所有旧版写入进程已停止后，核对查询摘要并归档原锁；不释放任务写入权，不自动停止或重启服务。' },
  { name: 'inspect_execution_writer', schema: executionContextSchema.pick({ project: true }), run: inspectExecutionWriter,
    description: '只读查询当前写入执行的身份、分支、HEAD、验证记录及工作区范围状态；用于审计遗留占用。' },
  { name: 'abort_execution', schema: abortExecutionSchema, run: abortExecution,
    description: '显式中止已核验的遗留执行。须提供查询所得执行 ID、原会话、分支和 HEAD，记录具名操作者、原因及范围状态后释放写入权。不伪造验证或提交；有未提交内容时先审阅。' },
  { name: 'session_init', schema: executionContextSchema, run: initSession,
    description: '只读查看 Sidecar 代码写入执行绑定、分支和范围归属。execution=null 仅表示该会话尚未取得代码写入权，不表示 Forge Runtime 自动监督任务未绑定；本工具不创建 Change、不抢锁。' },
  { name: 'resolve_execution_context', schema: resolveContextSchema, run: resolveContext,
    description: '只读缩小探索范围：无需预知 files，返回有来源和新鲜度的规格/图谱候选及缺口。不替 Agent 判断控制点，不保存执行状态。定位后 discover_execution 精确绑定候选范围。' },
  { name: 'check_execution_event', schema: executionEventSchema, run: checkExecutionEvent,
    description: '宿主生命周期统一策略入口。WRITE/COMMIT/STOP/GIT 在 Forge 内选择执行或旧规格检查，返回协议版本、allowed/code/enforcement 和兼容设计检查要求。Stop 只检查，不自动完成或释放任务。' },
  { name: 'discover_execution', schema: discoverExecutionSchema, run: discoverExecution,
    description: '修改前先探索：无需 changeId，返回既有 Requirement 原文、活跃 changes、Graphify 证据和版本。files 为本批次精确项目相对路径。读取原文后 assess_execution；未命中不能直接新建能力。' },
  { name: 'assess_execution', schema: assessExecutionSchema, run: assessExecution,
    description: '具名审阅行为/设计影响及原文引用，绑定会话共享分支和模块写入范围；按实际范围判断并行。同任务增补：inspect_execution_writer 读取 executionId/scopeRevision，discover 完整范围后携带 update:{executionId,expectedRevision}；保留身份及审计，旧验证失效。behavior=preserved 无需 OpenSpec；changed 先复用/建立相关 change，再走 resolve_specs。' },
  { name: 'check_execution_readiness', schema: executionCheckSchema, run: checkExecution,
    description: '检查执行会话、当前分支、规格版本和文件范围；拒绝自行切换/创建分支、worktree。提交前检查真实暂存区、适用设计更新及实际验证证据。无需 Change 的执行也使用此入口。' },
  { name: 'run_execution_verification', schema: runExecutionSchema, run: runExecutionVerification,
    description: '执行已授权测试 executable + argv（无Shell），保存退出码与内容摘要。inputFiles 必填，包含测试/配置/依赖，分批保持相同列表；cwd 可为项目相对或项目内绝对目录。Windows openspec/npm/npx 自动解析已安装的 Node 入口。每项超时默认60秒最多120秒，整次实际预算4分钟，延期项返回 pendingChecks。VERIFICATION_PENDING 表示本批成功但缺类别或待运行项，非工具失败且尚不能提交；只补齐 missing/pendingChecks。真实失败返回 checkId，更换失败命令用同类别 replaces 显式替代。禁止部署/重启或伪造空检查。' },
  { name: 'finish_execution', schema: executionContextSchema, run: finishExecution,
    description: '确认本批次验证及提交后释放共享工作区写入权。先逐任务原子提交，不自动提交、建分支或归档 OpenSpec；无需 Change 的执行可直接结束。' },
] as const
