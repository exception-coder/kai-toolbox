package com.exceptioncoder.toolbox.claudechat.domain;

import java.util.List;
import java.util.Map;

/** 当前会话生成 SQL 前取得的目标表 DDL 证据。 */
public record SqlDdlEvidence(
        String evidenceId,
        String status,
        String project,
        String baselinePath,
        List<String> requestedTables,
        List<String> verifiedTables,
        List<String> missingTables,
        List<String> candidateProjects,
        Map<String, String> ddlFragments,
        String warning,
        long checkedAt) {

    public static final String STATUS_VERIFIED = "VERIFIED";
    public static final String STATUS_PARTIAL = "PARTIAL";
    public static final String STATUS_DDL_MISSING = "DDL_MISSING";
    public static final String STATUS_PROJECT_AMBIGUOUS = "PROJECT_AMBIGUOUS";
    public static final String STATUS_STALE = "STALE";
    public static final String STATUS_NOT_CHECKED = "NOT_CHECKED";
}
