package com.exceptioncoder.toolbox.reqpool.domain;

/**
 * 需求中枢规划评估命令。
 *
 * @param prdSessionId 规格会话 ID
 * @param sourceReqItemId 来源需求 ID
 * @param title 需求标题
 * @param rawInput 原始需求
 * @param project 关联项目
 * @param module 关联模块
 * @param reqType 已确认的需求类型
 * @param model 模型配置
 * @param engine 执行引擎
 * @param initialSpec 已确认初始化规格
 * @param evidenceTraceJson 证据路由与查询轨迹快照
 */
public record ReqPlanningCommand(
        String prdSessionId,
        String sourceReqItemId,
        String title,
        String rawInput,
        String project,
        String module,
        String reqType,
        String model,
        String engine,
        String initialSpec,
        String evidenceTraceJson
) {
}
