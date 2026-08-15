package com.exceptioncoder.toolbox.reqpool.domain;

/**
 * 当前需求洞察的新鲜度投影。
 *
 * @param analysisType 最新分析类型
 * @param promptVersion 最新提示词版本
 * @param generatedAt 生成时间
 * @param stale 是否已经失效
 * @param staleReason 失效原因
 */
public record ReqInsightStatus(
        ReqInsightType analysisType,
        String promptVersion,
        Long generatedAt,
        boolean stale,
        String staleReason
) {
    public static ReqInsightStatus absent() {
        return new ReqInsightStatus(null, null, null, false, null);
    }

    public static ReqInsightStatus legacy() {
        return new ReqInsightStatus(null, null, null, true, "LEGACY_UNVERIFIED");
    }
}
