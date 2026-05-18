package com.exceptioncoder.toolbox.browserrequest.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Pipeline 单次运行的元信息 + 失败明细，对应 {@code browser_request_pipeline_run} 表。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PipelineRun {
    private String id;
    private String pipelineId;
    private String sessionId;
    private long startedAt;
    private Long finishedAt;
    /** running / done / cancelled / failed */
    private String status;
    private boolean dryRun;
    /** 汇总 JSON: { totalSteps, okSteps, failedSteps, abortedAtStep } */
    private String summaryJson;
    /** 失败明细数组 JSON */
    private String failuresJson;
}
