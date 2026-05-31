package com.exceptioncoder.toolbox.browserrequest.domain;

/**
 * 一个参数化点：把某 step 内某 field 的一段子串替换为变量。
 *
 * field 取值：
 *   - "url"          - 整 URL（含 path + query）
 *   - "path"         - 仅 URL 的 path 段
 *   - "query.{key}"  - 某个 query 参数的 value
 *   - "header.{key}" - 某个 header 的 value
 *   - "body"         - 请求体
 *
 * token：原文中存在的字符串片段（保存时校验恰好出现一次）
 * varName：替换后引用的变量名
 */
public record ParameterizationSpec(
        String field,
        String token,
        String varName
) {
}
