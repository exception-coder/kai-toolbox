package com.exceptioncoder.toolbox.ops.api.dto;

import java.util.List;

/**
 * SQL 执行结果。
 * 查询语句：columns + rows 有值，updateCount = -1。
 * DML/DDL：updateCount >= 0，columns/rows 为空。
 * truncated 表示结果被 maxRows 截断。
 */
public record SqlQueryResult(
        List<String> columns,
        List<List<String>> rows,
        int rowCount,
        int updateCount,
        boolean truncated,
        long elapsedMs
) {}
