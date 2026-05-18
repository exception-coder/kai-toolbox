package com.exceptioncoder.toolbox.browserrequest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;

/**
 * 后端版的极简 JSONPath，必须和前端 {@code utils/jsonpath.ts} 的子集保持一致。
 *
 * 支持：
 *   $              根
 *   $.a.b          对象点取
 *   $.a.b[0]       数组下标
 *   $["with-dash"] 方括号字符串键
 *   $.a[*]         数组通配（隐式扁平一层）
 *   $.a[*].b       数组通配后再点取
 *   $.a[*].b[*]    多层通配——扁平到单层数组
 *
 * 不支持：$..递归 / 过滤器 / 函数。
 */
public final class SimpleJsonPath {

    private SimpleJsonPath() {}

    /** 在 JSON 文本上求值，路径不存在返回 null。 */
    public static JsonNode eval(String json, String path, ObjectMapper mapper) {
        if (json == null || json.isEmpty()) return null;
        JsonNode root;
        try { root = mapper.readTree(json); } catch (Exception e) { return null; }
        return eval(root, path);
    }

    public static JsonNode eval(JsonNode root, String path) {
        if (root == null) return null;
        String trimmed = path == null ? "" : path.trim();
        if (trimmed.isEmpty() || "$".equals(trimmed)) return root;
        if (!trimmed.startsWith("$")) return null;

        // 用 List<JsonNode> 作为「当前游标」——支持 [*] 一次性映射到多个节点
        java.util.List<JsonNode> currents = new java.util.ArrayList<>();
        currents.add(root);
        boolean flattenedOnce = false;     // 路径里出现过 [*]，最终结果包成 ArrayNode

        int i = 1;
        while (i < trimmed.length()) {
            char ch = trimmed.charAt(i);
            if (ch == '.') {
                int j = i + 1;
                while (j < trimmed.length()) {
                    char c = trimmed.charAt(j);
                    if (Character.isLetterOrDigit(c) || c == '_' || c == '$') j++;
                    else break;
                }
                if (j == i + 1) return null;
                String key = trimmed.substring(i + 1, j);
                currents = mapField(currents, key, flattenedOnce);
                i = j;
            } else if (ch == '[') {
                int close = trimmed.indexOf(']', i);
                if (close < 0) return null;
                String tok = trimmed.substring(i + 1, close).trim();
                if ("*".equals(tok)) {
                    // 通配：每个 current 必须是 array，把其元素扁平到下一层
                    java.util.List<JsonNode> next = new java.util.ArrayList<>();
                    for (JsonNode n : currents) {
                        if (n != null && n.isArray()) {
                            for (JsonNode child : n) next.add(child);
                        }
                    }
                    currents = next;
                    flattenedOnce = true;
                } else if (tok.matches("-?\\d+")) {
                    int idx = Integer.parseInt(tok);
                    java.util.List<JsonNode> next = new java.util.ArrayList<>();
                    for (JsonNode n : currents) {
                        if (n != null && n.isArray()) {
                            int actual = idx < 0 ? n.size() + idx : idx;
                            if (actual >= 0 && actual < n.size()) next.add(n.get(actual));
                            else if (!flattenedOnce) next.add(null);
                        } else if (!flattenedOnce) {
                            next.add(null);
                        }
                    }
                    currents = next;
                } else if ((tok.startsWith("\"") && tok.endsWith("\""))
                        || (tok.startsWith("'") && tok.endsWith("'"))) {
                    String key = tok.substring(1, tok.length() - 1);
                    currents = mapField(currents, key, flattenedOnce);
                } else {
                    return null;
                }
                i = close + 1;
            } else {
                return null;
            }
        }

        if (!flattenedOnce) {
            return currents.isEmpty() ? null : currents.get(0);
        }
        ArrayNode arr = JsonNodeFactory.instance.arrayNode(currents.size());
        for (JsonNode n : currents) if (n != null) arr.add(n);
        return arr;
    }

    private static java.util.List<JsonNode> mapField(java.util.List<JsonNode> currents, String key, boolean flattened) {
        java.util.List<JsonNode> next = new java.util.ArrayList<>();
        for (JsonNode n : currents) {
            if (n == null) {
                if (!flattened) next.add(null);
                continue;
            }
            JsonNode v = n.get(key);
            if (v != null) next.add(v);
            else if (!flattened) next.add(null);
        }
        return next;
    }

    /** 把 JsonNode 求值结果归一为字符串（用于变量存储）。 */
    public static String stringify(JsonNode node) {
        if (node == null || node.isNull()) return "";
        if (node.isValueNode()) return node.asText();
        return node.toString();
    }
}
