package com.exceptioncoder.toolbox.prdclarify.service;

import java.util.List;

/** 一条可审计的 PRD/TDD 差异；只有独立复核写成 VERIFIED 才算完成对齐。 */
public record PrdDocDiffItem(
        String id,
        String sourceDocument,
        String sourceSection,
        String currentDocument,
        String evidenceLevel,
        List<String> evidenceIds,
        String actualEvidence,
        String proposedChange,
        String changeKind,
        String status
) {
}
