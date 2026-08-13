package com.exceptioncoder.toolbox.ops.service;

import java.util.Set;

/** DB Console 第一期的只读 SQL 边界：仅接受单条 SELECT / WITH 查询。 */
final class ReadOnlySqlPolicy {

    private static final Set<String> FORBIDDEN_KEYWORDS = Set.of(
            "INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE", "UPSERT",
            "CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME",
            "GRANT", "REVOKE", "CALL", "EXEC", "EXECUTE",
            "BEGIN", "DECLARE", "COMMIT", "ROLLBACK", "SAVEPOINT",
            "LOCK", "UNLOCK", "INTO"
    );

    private ReadOnlySqlPolicy() {
    }

    static String validateAndNormalize(String sql) {
        SqlStatementPolicy.Analysis analysis = SqlStatementPolicy.analyze(sql);
        String normalized = analysis.normalizedSql();
        String searchable = SqlStatementPolicy.stripCommentsAndQuotedText(normalized).toUpperCase(java.util.Locale.ROOT);
        String firstKeyword = analysis.firstKeyword();
        if (!"SELECT".equals(firstKeyword) && !"WITH".equals(firstKeyword)) {
            throw new IllegalArgumentException("轻量 DB Console 仅允许执行 SELECT / WITH 查询");
        }

        for (String keyword : FORBIDDEN_KEYWORDS) {
            if (SqlStatementPolicy.containsKeyword(searchable, keyword)) {
                throw new IllegalArgumentException("检测到非只读关键字 " + keyword + "，已拒绝执行");
            }
        }
        return normalized;
    }

    static boolean isReadOnly(String sql) {
        try {
            validateAndNormalize(sql);
            return true;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }
}
