package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.domain.FlowAction;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 「代码裁决」：把 LLM 吐出的文本解析成动作列表并逐条校验、归一化。
 *
 * <p>LLM 输出一律当不可信入参：剥离可能的 markdown 围栏 → 解析为数组 → 每步 type 必须在白名单、
 * 必填字段齐备，否则抛 {@link IllegalArgumentException}（带可读原因，供上层回传/触发重写）。
 */
@Component
public class FlowActionValidator {

    private static final Set<String> TYPES =
            Set.of("navigate", "fill", "click", "press", "scroll", "waitFor", "assert");
    private static final Set<String> ASSERTS =
            Set.of("urlContains", "selectorVisible", "textPresent");
    private static final TypeReference<List<FlowAction>> LIST = new TypeReference<>() {};

    private final ObjectMapper objectMapper;

    public FlowActionValidator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 解析+校验 LLM 原始输出，返回归一化后的合法动作列表；非法即抛 IllegalArgumentException。 */
    public List<FlowAction> parseAndValidate(String raw) {
        String json = extractJsonArray(raw);
        List<FlowAction> list;
        try {
            list = objectMapper.readValue(json, LIST);
        } catch (Exception e) {
            throw new IllegalArgumentException("LLM 输出不是合法的动作 JSON 数组：" + e.getMessage());
        }
        if (list == null || list.isEmpty()) {
            throw new IllegalArgumentException("LLM 未产出任何动作");
        }
        List<FlowAction> out = new ArrayList<>(list.size());
        boolean hasAssert = false;
        for (int i = 0; i < list.size(); i++) {
            FlowAction a = list.get(i);
            String t = a.type() == null ? null : a.type().trim();
            if (t == null || !TYPES.contains(t)) {
                throw new IllegalArgumentException("第 " + (i + 1) + " 步 type 非法：" + a.type());
            }
            switch (t) {
                case "navigate" -> require(a.url(), i, "url");
                case "fill" -> { require(a.selector(), i, "selector"); require(a.text(), i, "text"); }
                case "click", "waitFor" -> require(a.selector(), i, "selector");
                case "press" -> require(a.key(), i, "key");
                case "scroll" -> {
                    if (a.dy() == null && isBlank(a.selector())) {
                        throw new IllegalArgumentException("第 " + (i + 1) + " 步 scroll 需要 dy 或 selector");
                    }
                }
                case "assert" -> {
                    hasAssert = true;
                    String at = a.assertType();
                    if (at == null || !ASSERTS.contains(at)) {
                        throw new IllegalArgumentException("第 " + (i + 1) + " 步 assertType 非法：" + at);
                    }
                    if ("selectorVisible".equals(at)) require(a.selector(), i, "selector");
                    else require(a.value(), i, "value");
                }
                default -> throw new IllegalArgumentException("第 " + (i + 1) + " 步未知 type：" + t);
            }
            out.add(new FlowAction(t, a.selector(), a.text(), a.key(), a.dy(), a.url(),
                    a.assertType(), a.value(), a.timeoutMs()));
        }
        if (!hasAssert) {
            throw new IllegalArgumentException("脚本缺少任何 assert 断言步骤——无法确定性判定执行是否成功");
        }
        return out;
    }

    private void require(String v, int i, String field) {
        if (isBlank(v)) {
            throw new IllegalArgumentException("第 " + (i + 1) + " 步缺少必填字段：" + field);
        }
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /** LLM 偶尔包 ```json 围栏或前后带话；截取第一个 '[' 到最后一个 ']' 之间作为数组体。 */
    private String extractJsonArray(String raw) {
        if (raw == null) throw new IllegalArgumentException("LLM 输出为空");
        String s = raw.trim();
        int start = s.indexOf('[');
        int end = s.lastIndexOf(']');
        if (start < 0 || end < 0 || end <= start) {
            throw new IllegalArgumentException("LLM 输出中找不到 JSON 数组：" + truncate(s));
        }
        return s.substring(start, end + 1);
    }

    private String truncate(String s) {
        return s.length() <= 200 ? s : s.substring(0, 200) + "…";
    }
}
