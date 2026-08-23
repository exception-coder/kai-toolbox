package com.exceptioncoder.toolbox.reqpool.api.dto;

import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessment;

/**
 * 需求规划评估前端视图。
 *
 * @param id 运行 ID
 * @param status RUNNING、COMPLETED 或 FAILED
 * @param criteriaVersion 评估准则版本
 * @param promptVersion Prompt 版本
 * @param inputHash 初始化规格输入指纹
 * @param payloadJson 服务端归一化结果
 * @param engine 执行引擎
 * @param model 模型配置
 * @param errorMessage 失败原因
 * @param startedAt 开始时间
 * @param completedAt 完成时间
 */
public record ReqPlanningAssessmentView(
        String id,
        String status,
        String criteriaVersion,
        String promptVersion,
        String inputHash,
        String evidenceTraceJson,
        String payloadJson,
        String engine,
        String model,
        String errorMessage,
        long startedAt,
        Long completedAt
) {
    /** 从运行账本生成安全视图，不返回输入快照或模型原始输出。 */
    public static ReqPlanningAssessmentView from(ReqPlanningAssessment assessment) {
        if (assessment == null) {
            return null;
        }
        return new ReqPlanningAssessmentView(
                assessment.getId(), assessment.getStatus(), assessment.getCriteriaVersion(),
                assessment.getPromptVersion(), assessment.getInputHash(), assessment.getEvidenceTraceJson(), assessment.getPayloadJson(),
                assessment.getEngine(), assessment.getModel(), assessment.getErrorMessage(),
                assessment.getStartedAt(), assessment.getCompletedAt());
    }
}
