package com.exceptioncoder.toolbox.prdclarify.domain;

/**
 * PRD 的业务来源字段。它们与澄清过程字段分开保存，便于从飞书等需求池导入后查询和追溯。
 *
 * <p>{@code businessRequirementType} 保存业务侧原始分类（如“新需求/功能优化/系统缺陷”），
 * 不等同于 {@link PrdSession#getReqType()} 使用的 AI 澄清策略分类。</p>
 */
public record PrdBusinessFields(
        String requirementDetail,
        String businessBackground,
        String businessRequirementType,
        String requirementSoftware,
        String initiatingDepartment,
        String requester,
        String requestedAt,
        String attachments,
        String followUpRecords
) {
    public static PrdBusinessFields empty() {
        return new PrdBusinessFields(null, null, null, null, null, null, null, null, null);
    }
}
