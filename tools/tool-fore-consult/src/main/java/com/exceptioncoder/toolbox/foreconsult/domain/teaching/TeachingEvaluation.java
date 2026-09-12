package com.exceptioncoder.toolbox.foreconsult.domain.teaching;

import java.util.List;

/** 版本关联的教学回归结果，不作为生产发布授权。 */
public record TeachingEvaluation(
        /** 评测 ID。 */ String id,
        /** 保存版本。 */ Long version,
        /** 执行模式。 */ String mode,
        /** 百分制精确匹配率。 */ Double score,
        /** 是否达到教学阈值。 */ Boolean passed,
        /** 每个样本的执行和差异。 */ List<CaseResult> cases,
        /** 创建时间。 */ Long createdAt) {
    /** 单样本独立标准答案及实际结果。 */
    public record CaseResult(
            /** 固定样本。 */ TeachingScenario scenario,
            /** 实际执行。 */ TeachingRun actual,
            /** 不一致的字段。 */ List<String> differences) {
    }
}
