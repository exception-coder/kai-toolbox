package com.exceptioncoder.toolbox.browserrequest.domain;

/**
 * Task 入参定义：回放时用户需要填的字段清单。
 *
 * kind：'string' / 'number' / 'boolean'。defaultValue 始终是字符串，运行时按 kind 转型。
 */
public record ParamSpec(
        String name,
        String kind,
        String defaultValue
) {
}
