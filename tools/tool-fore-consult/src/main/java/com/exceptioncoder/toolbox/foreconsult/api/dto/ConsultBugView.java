package com.exceptioncoder.toolbox.foreconsult.api.dto;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultBug;

/**
 * BUG 登记的前端视图（只读）。evidence/refs 沿用库中 JSON 字符串原样透出，由前端解析。
 */
public record ConsultBugView(
        String bugId,
        String consultSessionId,
        String systemName,
        String module,
        String role,
        String title,
        String type,
        String severity,
        String reproduce,
        String expected,
        String actual,
        String suspectArea,
        String evidence,
        String question,
        String answer,
        Integer aiConfidence,
        String refsJson,
        String status,
        int occurrenceCount,
        long firstSeenAt,
        long lastSeenAt
) {

    public static ConsultBugView from(ConsultBug b) {
        return new ConsultBugView(
                b.getBugId(), b.getConsultSessionId(), b.getSystemName(), b.getModule(), b.getRole(),
                b.getTitle(), b.getType(), b.getSeverity(), b.getReproduce(), b.getExpected(), b.getActual(),
                b.getSuspectArea(), b.getEvidence(), b.getQuestion(), b.getAnswer(), b.getAiConfidence(),
                b.getRefsJson(), b.getStatus(), b.getOccurrenceCount(), b.getFirstSeenAt(), b.getLastSeenAt());
    }
}
