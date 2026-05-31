package com.exceptioncoder.toolbox.browserrequest.domain;

import com.exceptioncoder.toolbox.browserrequest.domain.enums.RecordingStatus;

/**
 * 录制元数据。一次「开始录 → 停止」对应一条 Recording，关联多条 {@link HttpCall}。
 *
 * 状态机：RECORDING → STOPPED / AUTO_STOPPED / ABANDONED。终态后不变。
 */
public record Recording(
        String id,
        String sessionId,
        String name,
        RecordingStatus status,
        boolean captureScript,
        long startedAt,
        Long endedAt,
        int callCount
) {
    public Recording withStatus(RecordingStatus next, Long endedAt) {
        return new Recording(id, sessionId, name, next, captureScript, startedAt, endedAt, callCount);
    }

    public Recording withCallCount(int newCount) {
        return new Recording(id, sessionId, name, status, captureScript, startedAt, endedAt, newCount);
    }
}
