package com.exceptioncoder.toolbox.foreconsult.domain;

/** Stable consultation turn identity reserved before the Agent request is dispatched. */
public record ConsultTurnTrace(
        String turnId,
        String sessionId,
        int turnIndex,
        String traceId,
        long startedAt,
        Long completedAt
) {
}
