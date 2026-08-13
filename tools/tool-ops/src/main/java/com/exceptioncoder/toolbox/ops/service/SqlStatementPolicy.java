package com.exceptioncoder.toolbox.ops.service;

import java.util.Locale;
import java.util.Set;

/** SQL Console 的基础语句边界：只接收一条完整 SQL，并给出粗粒度语句类型。 */
final class SqlStatementPolicy {

    private static final Set<String> READ_KEYWORDS = Set.of("SELECT", "WITH", "SHOW", "DESC", "DESCRIBE", "EXPLAIN");
    private static final Set<String> DML_KEYWORDS = Set.of("INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE", "UPSERT");
    private static final Set<String> DDL_KEYWORDS = Set.of(
            "CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME", "COMMENT", "GRANT", "REVOKE"
    );

    private SqlStatementPolicy() {
    }

    static Analysis analyze(String sql) {
        String normalized = SqlConnector.stripTrailingSemicolon(sql);
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("请输入 SQL");
        }

        String searchable = stripCommentsAndQuotedText(normalized).toUpperCase(Locale.ROOT);
        if (searchable.indexOf(';') >= 0) {
            throw new IllegalArgumentException("一次只能执行或检查一条 SQL");
        }

        String firstKeyword = firstKeyword(searchable);
        if (firstKeyword.isBlank()) {
            throw new IllegalArgumentException("未识别到有效 SQL");
        }
        StatementType statementType = READ_KEYWORDS.contains(firstKeyword)
                ? StatementType.READ
                : DML_KEYWORDS.contains(firstKeyword)
                ? StatementType.DML
                : DDL_KEYWORDS.contains(firstKeyword) ? StatementType.DDL : StatementType.OTHER;
        return new Analysis(normalized, firstKeyword, statementType);
    }

    static boolean containsKeyword(String sql, String keyword) {
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

    static String stripCommentsAndQuotedText(String sql) {
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
                    } else if (current == '`') {
                        result.append(' ');
                        state = ScanState.BACKTICK;
                    } else {
                        result.append(current);
                    }
                }
                case LINE_COMMENT -> {
                    result.append(current == '\n' ? '\n' : ' ');
                    if (current == '\n') state = ScanState.NORMAL;
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
                case BACKTICK -> {
                    result.append(' ');
                    if (current == '`' && next == '`') {
                        result.append(' ');
                        index++;
                    } else if (current == '`') {
                        state = ScanState.NORMAL;
                    }
                }
            }
        }
        return result.toString();
    }

    private static String firstKeyword(String sql) {
        int start = 0;
        while (start < sql.length() && Character.isWhitespace(sql.charAt(start))) start++;
        int end = start;
        while (end < sql.length() && Character.isLetter(sql.charAt(end))) end++;
        return sql.substring(start, end);
    }

    private static boolean isIdentifierPart(char value) {
        return Character.isLetterOrDigit(value) || value == '_' || value == '$';
    }

    record Analysis(String normalizedSql, String firstKeyword, StatementType statementType) {
    }

    enum StatementType {
        READ,
        DML,
        DDL,
        OTHER
    }

    private enum ScanState {
        NORMAL,
        LINE_COMMENT,
        BLOCK_COMMENT,
        SINGLE_QUOTE,
        DOUBLE_QUOTE,
        BACKTICK
    }
}
