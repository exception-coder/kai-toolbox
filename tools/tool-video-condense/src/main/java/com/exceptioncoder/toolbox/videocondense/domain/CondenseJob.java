package com.exceptioncoder.toolbox.videocondense.domain;

/**
 * 作业持久化快照（每次从 DB 读出即重建，不可变）。状态/曲线/错误的变更走 Repository 的 update SQL。
 *
 * @param durationSec 探测时长（秒），未知为 {@code null}
 * @param curveJson   速度曲线 JSON（List&lt;SegmentView&gt;），ANALYZED 后有值，否则 {@code null}
 * @param error       FAILED 时的简短原因，否则 {@code null}
 */
public record CondenseJob(
        String id,
        String inputPath,
        JobStatus status,
        Double durationSec,
        String curveJson,
        String error,
        long createdAt,
        long updatedAt
) {}
