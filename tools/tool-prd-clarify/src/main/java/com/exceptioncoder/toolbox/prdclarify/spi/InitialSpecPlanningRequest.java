package com.exceptioncoder.toolbox.prdclarify.spi;

/**
 * 初始化规格确认后提交给需求规划能力的稳定请求。
 *
 * @param prdSessionId 规格会话 ID
 * @param sourceReqItemId 来源需求 ID，独立探索时为空
 * @param title 需求标题
 * @param rawInput 原始需求描述
 * @param project 关联项目
 * @param module 关联模块
 * @param reqType 已确认的需求类型
 * @param model 模型配置
 * @param engine 执行引擎
 * @param initialSpec 已确认的初始化规格快照
 * @param evidenceTraceJson 规划前证据路由与查询结果快照
 */
public record InitialSpecPlanningRequest(
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
