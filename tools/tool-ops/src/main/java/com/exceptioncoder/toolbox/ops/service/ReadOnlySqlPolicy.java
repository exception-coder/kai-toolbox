package com.exceptioncoder.toolbox.ops.service;

import java.util.Locale;
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
        String normalized = SqlConnector.stripTrailingSemicolon(sql);
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("请输入 SQL");
        }

        String searchable = stripCommentsAndQuotedText(normalized).toUpperCase(Locale.ROOT);
        String firstKeyword = firstKeyword(searchable);
        if (!"SELECT".equals(firstKeyword) && !"WITH".equals(firstKeyword)) {
            throw new IllegalArgumentException("轻量 DB Console 仅允许执行 SELECT / WITH 查询");
        }
        if (searchable.indexOf(';') >= 0) {
            throw new IllegalArgumentException("一次只能执行一条 SQL");
        }

        for (String keyword : FORBIDDEN_KEYWORDS) {
            if (containsKeyword(searchable, keyword)) {
                throw new IllegalArgumentException("检测到非只读关键字 " + keyword + "，已拒绝执行");
            }
        }
        return normalized;
    }

    private static String firstKeyword(String sql) {
        int start = 0;
        while (start < sql.length() && Character.isWhitespace(sql.charAt(start))) {
            start++;
        }
        int end = start;
        while (end < sql.length() && Character.isLetter(sql.charAt(end))) {
            end++;
        }
        return sql.substring(start, end);
    }

    private static boolean containsKeyword(String sql, String keyword) {
        int from = 0;
        while ((from = sql.indexOf(keyword, from)) >= 0) {
            int end = from + keyword.length();
            boolean leftBoundary = from == 0 || !isIdentifierPart(sql.charAt(from - 1));
            boolean rightBoundary = end == sql.length() || !isIdentifierPart(sql.charAt(end));
            if (leftBoundary && rightBoundary) {
                return true;
            }
            from = end;
        }
        return false;
    }

    private static boolean isIdentifierPart(char value) {
        return Character.isLetterOrDigit(value) || value == '_' || value == '$';
    }

    private static String stripCommentsAndQuotedText(String sql) {
        StringBuilder result = new StringBuilder(sql.length());
        ScanState state = ScanState.NORMAL;
        for (int index = 0; index < sql.length(); index++) {
            char current = sql.charAt(index);
            char next = index + 1 < sql.length() ? sql.charAt(index + 1) : '\0';
            switch (state) {
                case NORMAL -> {
                    if (current == '-' && next == '-') {
                        result.append("  ");
                        index++;
                        state = ScanState.LINE_COMMENT;
                    } else if (current == '/' && next == '*') {
                        result.append("  ");
                        index++;
                        state = ScanState.BLOCK_COMMENT;
                    } else if (current == '\'') {
                        result.append(' ');
                        state = ScanState.SINGLE_QUOTE;
                    } else if (current == '"') {
                        result.append(' ');
                        state = ScanState.DOUBLE_QUOTE;
                    } else {
                        result.append(current);
                    }
                }
                case LINE_COMMENT -> {
                    result.append(current == '\n' ? '\n' : ' ');
                    if (current == '\n') {
                        state = ScanState.NORMAL;
                    }
                }
                case BLOCK_COMMENT -> {
                    result.append(' ');
                    if (current == '*' && next == '/') {
                        result.append(' ');
                        index++;
                        state = ScanState.NORMAL;
                    }
                }
                case SINGLE_QUOTE -> {
                    result.append(' ');
                    if (current == '\'' && next == '\'') {
                        result.append(' ');
                        index++;
                    } else if (current == '\'') {
                        state = ScanState.NORMAL;
                    }
                }
                case DOUBLE_QUOTE -> {
                    result.append(' ');
                    if (current == '"' && next == '"') {
                        result.append(' ');
                        index++;
                    } else if (current == '"') {
                        state = ScanState.NORMAL;
                    }
                }
            }
        }
        return result.toString();
    }

    private enum ScanState {
        NORMAL,
        LINE_COMMENT,
        BLOCK_COMMENT,
        SINGLE_QUOTE,
        DOUBLE_QUOTE
    }
}
