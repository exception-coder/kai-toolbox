package com.exceptioncoder.toolbox.llm.monitor.dto;

import java.util.List;

/** 通用分页结果。 */
public record PageResult<T>(int page, int size, long total, List<T> items) {
}
