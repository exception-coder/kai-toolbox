package com.exceptioncoder.toolbox.prdclarify.domain;

/** PRD 模块内已纳入版本治理的 Prompt 用途。 */
public enum PrdPromptPurpose {
    /** 文档变更第一阶段证据分析。 */
    DOC_CHANGE_ANALYZER,
    /** 文档变更第二阶段独立复核。 */
    DOC_CHANGE_VERIFIER,
    /** 基于文档与源码证据生成进度报告。 */
    PROGRESS_EVALUATION
}
