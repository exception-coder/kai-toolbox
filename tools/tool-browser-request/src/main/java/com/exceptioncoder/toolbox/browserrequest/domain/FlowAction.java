package com.exceptioncoder.toolbox.browserrequest.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * AI 用例的单个确定性动作（LLM 提议、代码裁决的"受限指令集"）。
 *
 * <p>LLM 只能从固定 {@code type} 集合里产出动作，代码侧 {@code FlowActionValidator} 逐条校验+归一化；
 * 执行侧（patchright sidecar / Playwright-Java）按选择器确定性执行。这样 LLM 的不确定性被关进
 * "编写"环节，"执行"环节是纯确定性的可复现脚本。
 *
 * <p>type 取值与必填字段：
 * <ul>
 *   <li>{@code navigate} → url</li>
 *   <li>{@code fill} → selector + text</li>
 *   <li>{@code click} → selector</li>
 *   <li>{@code press} → key（可选 selector，给则在该元素上按键）</li>
 *   <li>{@code scroll} → dy 或 selector（给 selector 则滚动到该元素可见）</li>
 *   <li>{@code waitFor} → selector（等到可见）</li>
 *   <li>{@code assert} → assertType ∈ {urlContains, selectorVisible, textPresent}；
 *       selectorVisible 用 selector，其余用 value</li>
 * </ul>
 * 未知字段一律忽略（LLM 偶尔多吐字段不应导致解析失败）。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FlowAction(
        String type,
        String selector,
        String text,
        String key,
        Integer dy,
        String url,
        String assertType,
        String value,
        Integer timeoutMs
) {}
