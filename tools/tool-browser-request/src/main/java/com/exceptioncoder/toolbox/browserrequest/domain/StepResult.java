package com.exceptioncoder.toolbox.browserrequest.domain;

import java.util.Map;

/**
 * 单次回放中某 step 的执行结果。stepIndex 与 Task.steps 一一对应。
 *
 * iterationIndex / iterationTotal：当 step 引用的变量在上游 outputs 里是数组时，
 * 引擎隐式 fan-out 跑 N 次，每次产生一条 StepResult，iterationIndex 标记是第几次（从 0 起），
 * iterationTotal 标记总数。普通 step 这两个字段都为 null。
 *
 * status / elapsedMs / finalUrl 为请求结果；
 * responseSample 是响应体的截断预览（≤ 8KB）便于历史查看；
 * extracted 是本 step 抽取出来的 outputs，可被下游 step 引用；
 * error 非空表示本 step 失败（HTTP 异常 / 缺变量 / 抽取失败）。
 */
public record StepResult(
        int stepIndex,
        Integer iterationIndex,
        Integer iterationTotal,
        String stepName,
        Integer status,
        Integer elapsedMs,
        String finalUrl,
        String responseSample,
        Map<String, String> extracted,
        String error
) {
}
