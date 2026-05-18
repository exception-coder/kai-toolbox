package com.exceptioncoder.toolbox.browserrequest.service;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * `{{name}}` 占位符渲染。语法：
 *   {{name}} 或 {{ name }}（前后空白容忍）
 *   名字字符集：[A-Za-z_][A-Za-z0-9_]*
 *
 * 缺失变量直接抛 {@link MissingVarException}——好过把字面值送到服务端被静默接受。
 */
public final class TemplateRenderer {

    private TemplateRenderer() {}

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*}}");

    /** 扩展的占位符模式，支持 dot path 和数组下标，用于 foreach 的 `{{item.xxx}}` 形式。 */
    private static final Pattern PLACEHOLDER_EXT = Pattern.compile(
            "\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*|\\[\\d+\\])*)\\s*}}");

    /** 渲染单串。input 为 null 时返回 null（保留 null 语义供 header/body 区分空值 vs 未传）。 */
    public static String render(String input, Map<String, String> vars) {
        if (input == null) return null;
        Matcher m = PLACEHOLDER.matcher(input);
        StringBuilder sb = new StringBuilder();
        Set<String> missing = null;
        while (m.find()) {
            String key = m.group(1);
            String value = vars.get(key);
            if (value == null) {
                if (missing == null) missing = new LinkedHashSet<>();
                missing.add(key);
                continue;
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(value));
        }
        m.appendTail(sb);
        if (missing != null) throw new MissingVarException(missing);
        return sb.toString();
    }

    /**
     * Pipeline 用：同时支持
     *   {{item.xxx}}  从 itemNode 取（itemNode 可为 null 表示当前不是 foreach 上下文）
     *   {{name}}      先从 chainVars (JsonNode) 取，再从 sessionVars (String) 取
     * chainVars 命中时如果是数组/对象，stringify 成 JSON。
     */
    public static String renderWith(String input,
                                     Map<String, String> sessionVars,
                                     Map<String, JsonNode> chainVars,
                                     JsonNode itemNode) {
        if (input == null) return null;
        Matcher m = PLACEHOLDER_EXT.matcher(input);
        StringBuilder sb = new StringBuilder();
        Set<String> missing = null;
        while (m.find()) {
            String expr = m.group(1);
            String value = null;
            if (expr.equals("item") || expr.startsWith("item.") || expr.startsWith("item[")) {
                if (itemNode != null) {
                    String pathForEval;
                    if (expr.equals("item")) pathForEval = "$";
                    else if (expr.startsWith("item.")) pathForEval = "$." + expr.substring(5);
                    else pathForEval = "$" + expr.substring(4);
                    JsonNode v = SimpleJsonPath.eval(itemNode, pathForEval);
                    if (v != null) value = SimpleJsonPath.stringify(v);
                }
            } else {
                // chain var 优先（如果是数组/对象，用 toString 序列化）
                if (chainVars != null) {
                    JsonNode cn = chainVars.get(expr);
                    if (cn != null) value = SimpleJsonPath.stringify(cn);
                }
                if (value == null && sessionVars != null) {
                    value = sessionVars.get(expr);
                }
            }
            if (value == null) {
                if (missing == null) missing = new LinkedHashSet<>();
                missing.add(expr);
                continue;
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(value));
        }
        m.appendTail(sb);
        if (missing != null) throw new MissingVarException(missing);
        return sb.toString();
    }

    /**
     * 带循环变量 item 的渲染：
     *   {{item}} / {{item.xxx}} / {{item[0]}} / {{item.nested.field}}  → 从 itemNode 取
     *   {{otherName}}                                                  → 从 vars 取
     * 缺失同样抛 {@link MissingVarException}。
     */
    public static String renderWithItem(String input, Map<String, String> vars, JsonNode itemNode) {
        if (input == null) return null;
        Matcher m = PLACEHOLDER_EXT.matcher(input);
        StringBuilder sb = new StringBuilder();
        Set<String> missing = null;
        while (m.find()) {
            String expr = m.group(1);
            String value;
            if (expr.equals("item") || expr.startsWith("item.") || expr.startsWith("item[")) {
                String pathForEval;
                if (expr.equals("item")) pathForEval = "$";
                else if (expr.startsWith("item.")) pathForEval = "$." + expr.substring(5);
                else pathForEval = "$" + expr.substring(4);
                JsonNode v = SimpleJsonPath.eval(itemNode, pathForEval);
                if (v == null) {
                    if (missing == null) missing = new LinkedHashSet<>();
                    missing.add(expr);
                    continue;
                }
                value = SimpleJsonPath.stringify(v);
            } else {
                value = vars.get(expr);
                if (value == null) {
                    if (missing == null) missing = new LinkedHashSet<>();
                    missing.add(expr);
                    continue;
                }
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(value));
        }
        m.appendTail(sb);
        if (missing != null) throw new MissingVarException(missing);
        return sb.toString();
    }

    /** 找出文本里引用的所有变量名（用于诊断、UI 提示）。 */
    public static Set<String> referenced(String input) {
        Set<String> out = new HashSet<>();
        if (input == null) return out;
        Matcher m = PLACEHOLDER.matcher(input);
        while (m.find()) out.add(m.group(1));
        return out;
    }

    public static class MissingVarException extends RuntimeException {
        private final Set<String> names;
        public MissingVarException(Set<String> names) {
            super("缺少变量：" + String.join(", ", names));
            this.names = names;
        }
        public Set<String> getNames() { return names; }
    }
}
