import { discoverExecutionSchema, assessExecutionSchema, executionCheckSchema, executionContextSchema, runExecutionSchema, resolveContextSchema, executionEventSchema } from './contracts.js'
import { discoverExecution, resolveContext } from './context.js'
import { assessExecution, checkExecution, finishExecution } from './service.js'
import { runExecutionVerification } from './verification.js'
import { initSession } from './session.js'
import { checkExecutionEvent } from './lifecycle.js'

export const executionDefinitions = [
  { name: 'session_init', schema: executionContextSchema, run: initSession,
    description: '只读初始化会话上下文：返回项目能力、策略版本、当前执行/任务引用、分支和写入归属。不创建 Change、不抢锁、不修改项目；可调用不代表已授权或宿主已强制接入。' },
  { name: 'resolve_execution_context', schema: resolveContextSchema, run: resolveContext,
    description: '只读缩小探索范围：无需预知 files，返回有来源和新鲜度的规格/图谱候选及缺口。不替 Agent 判断控制点，不保存执行状态。定位后 discover_execution 精确绑定候选范围。' },
  { name: 'check_execution_event', schema: executionEventSchema, run: checkExecutionEvent,
    description: '宿主生命周期统一策略入口。WRITE/COMMIT/STOP/GIT 在 Forge 内选择执行或旧规格检查，返回协议版本、allowed/code/enforcement 和兼容设计检查要求。Stop 只检查，不自动完成或释放任务。' },
  { name: 'discover_execution', schema: discoverExecutionSchema, run: discoverExecution,
    description: '修改前先探索：无需 changeId，返回既有 Requirement 原文、活跃 changes、Graphify 证据和版本。files 为本批次精确项目相对路径。读取原文后 assess_execution；未命中不能直接新建能力。' },
  { name: 'assess_execution', schema: assessExecutionSchema, run: assessExecution,
    description: '具名审阅行为/设计影响及原文引用，绑定会话共享分支和单写入者。behavior=preserved 无需 OpenSpec；changed 先复用/建立相关 change，再走 resolve_specs。风险只增加验证要求，设计按 none/detail/architecture 独立判定。不得把未知填成 preserved。' },
  { name: 'check_execution_readiness', schema: executionCheckSchema, run: checkExecution,
    description: '检查执行会话、当前分支、规格版本和文件范围；拒绝自行切换/创建分支、worktree。提交前检查真实暂存区、适用设计更新及实际验证证据。无需 Change 的执行也使用此入口。' },
  { name: 'run_execution_verification', schema: runExecutionSchema, run: runExecutionVerification,
    description: '实际执行已授权的测试 executable + argv（无Shell），按影响检查 regression/api/sql/ui/spec/design 覆盖；保存退出码和输入内容摘要。inputFiles 必须包含测试、配置与相关依赖。禁止用此入口部署/重启或伪造空检查；kind/purpose 的语义覆盖需要审阅。超时默认60秒，最多120秒。' },
  { name: 'finish_execution', schema: executionContextSchema, run: finishExecution,
    description: '确认本批次验证及提交后释放共享工作区写入权。先逐任务原子提交，不自动提交、建分支或归档 OpenSpec；无需 Change 的执行可直接结束。' },
] as const
