package com.exceptioncoder.toolbox.claudechat.domain;

/** 当前开发会话涉及的一个服务端接口及其验证证据。 */
public record SessionAffectedApi(
        String id,
        String sessionId,
        String httpMethod,
        String apiPath,
        String changeType,
        String sourceFile,
        String handlerName,
        String summary,
        String verificationStatus,
        String verificationMethod,
        String verificationCommand,
        String verificationSummary,
        long createdAt,
        long updatedAt,
        Long verifiedAt
) {
    public static final String UNVERIFIED = "UNVERIFIED";
    public static final String PASSED = "PASSED";
    public static final String FAILED = "FAILED";
    public static final String NOT_APPLICABLE = "NOT_APPLICABLE";
}
