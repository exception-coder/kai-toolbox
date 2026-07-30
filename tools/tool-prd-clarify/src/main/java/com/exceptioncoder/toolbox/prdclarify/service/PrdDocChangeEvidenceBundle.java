package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.AnalysisExecutionProfile;

import java.util.List;
import java.util.Set;

/** 文档变更分析使用的确定性证据包及其运行配置。 */
public record PrdDocChangeEvidenceBundle(
        String title,
        String project,
        String module,
        String prd,
        String tdd,
        String prdHash,
        String tddHash,
        List<EvidenceItem> evidence,
        List<String> warnings,
        AnalysisExecutionProfile executionProfile
) {
    /** 返回证据包中全部可引用 ID。 */
    public Set<String> evidenceIds() {
        return evidence.stream().map(EvidenceItem::id).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    /** 单条可追溯证据。 */
    public record EvidenceItem(
            String id,
            String type,
            String summary,
            String content,
            boolean truncated
    ) {
    }
}
