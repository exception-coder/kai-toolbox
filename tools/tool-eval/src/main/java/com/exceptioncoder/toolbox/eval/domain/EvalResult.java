package com.exceptioncoder.toolbox.eval.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 单用例结果。{@code caseTitle} 是刻意的冗余快照——用例被改名或删除后，历史 run 报告仍然可读。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalResult {
    private String id;
    private String runId;
    private String caseId;
    private String caseTitle;
    private String verdict;
    private double score;
    private String outputJson;
    private String rawOutput;
    private String assertionsJson;
    private String error;
    private long latencyMs;
    private Long createdAt;
}
