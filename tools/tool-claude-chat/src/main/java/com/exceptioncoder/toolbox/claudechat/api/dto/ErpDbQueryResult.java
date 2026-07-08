package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * ERP 只读查询结果。error 非空=失败（含被 SELECT-only 拦截、连接失败等），此时其余字段为空。
 *
 * @param columns   列名
 * @param rows      行（每格已转字符串，JSON 安全）
 * @param rowCount  返回行数
 * @param truncated 是否超行数上限被截断
 * @param error     错误信息（成功为 null）
 */
public record ErpDbQueryResult(List<String> columns, List<List<String>> rows, int rowCount, boolean truncated, String error) {

    public static ErpDbQueryResult err(String msg) {
        return new ErpDbQueryResult(List.of(), List.of(), 0, false, msg);
    }
}
