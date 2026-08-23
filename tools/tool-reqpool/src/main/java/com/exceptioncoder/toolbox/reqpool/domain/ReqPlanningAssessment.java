package com.exceptioncoder.toolbox.reqpool.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 初始化规格驱动的需求规划评估运行。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReqPlanningAssessment {

    private String id;
    private String itemId;
    private String prdSessionId;
    private String inputHash;
    private String inputSnapshot;
    private String evidenceTraceJson;
    private String criteriaVersion;
    private String promptVersion;
    /** RUNNING | COMPLETED | FAILED。 */
    private String status;
    private String rawOutputJson;
    private String payloadJson;
    private String engine;
    private String model;
    private String errorMessage;
    private long startedAt;
    private Long completedAt;
    private long createdAt;
    private long updatedAt;
}
