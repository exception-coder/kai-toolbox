package com.exceptioncoder.toolbox.prdclarify.api.dto;

/** 用户确认的文档变更根因；与候选、原 PRD 会话和版本备份共同形成审计链。 */
public record CandidateChangeCauseRequest(String causeType, String detail) {
}
