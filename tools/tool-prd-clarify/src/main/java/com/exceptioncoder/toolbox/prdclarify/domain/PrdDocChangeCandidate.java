package com.exceptioncoder.toolbox.prdclarify.domain;

import lombok.Builder;
import lombok.Data;

/** Vibe Coding 对话与 Git 变化形成的一次文档更新候选。 */
@Data
@Builder
public class PrdDocChangeCandidate {
    private String id;
    private String prdSessionId;
    private String devSessionId;
    private long conversationFromSeq;
    private long conversationToSeq;
    private String codeSnapshotHash;
    private String decision;
    private String aiDecision;
    private String summary;
    private String reasoning;
    private String changeCauseType;
    private String changeCauseDetail;
    private String evidenceJson;
    private String prdPatchPlanJson;
    private String tddPatchPlanJson;
    private String risksJson;
    private String clarificationQuestion;
    private String clarificationHistoryJson;
    private int confidence;
    private String status;
    private String applyStage;
    private String lastError;
    private Long prdAppliedAt;
    private Long tddAppliedAt;
    private String revisionSessionId;
    private long createdAt;
    private long updatedAt;
}
