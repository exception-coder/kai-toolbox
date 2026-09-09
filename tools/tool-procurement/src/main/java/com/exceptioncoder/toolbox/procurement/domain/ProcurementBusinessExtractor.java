package com.exceptioncoder.toolbox.procurement.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** 只处理明确标签和值，角色段落以外的裸电话不自动认领。 */
public final class ProcurementBusinessExtractor {
    public static final String VERSION = "label-v2";
    private ProcurementBusinessExtractor() { }

    /** 多个不同候选不落单值，由后续解析处理。 */
    public static List<Map<String, String>> extract(String text) {
        List<Map<String, String>> facts = new ArrayList<>();
        single(facts, text, "project_number", "(?:项目编号|招标编号|采购项目编号)[：:]\\h*([^\\s，,；;]{3,100})", "项目概况");
        String amount = "(?:预算金额|最高限价|中标金额|成交金额)[：:]\\h*([0-9][0-9,.]*\\h*(?:亿元|万元|元))";
        single(facts, text, "procurement_amount", amount, "项目概况");
        if (facts.stream().noneMatch(f -> f.get("field").equals("procurement_amount"))) {
            single(facts, text, "procurement_amount", "(" + ProcurementValueTypes.LABELED_AMOUNT.pattern() + ")", "项目概况");
        }
        if (facts.stream().anyMatch(f -> f.get("field").equals("procurement_amount"))) {
            single(facts, text, "amount_type", "(预算金额|最高限价|中标金额|成交金额)[：:]\\h*[0-9][0-9,.]*\\h*(?:亿元|万元|元)", "项目概况");
        }
        contacts(facts, text, "owner", "(?:采购人|招标人)(?:信息)?", "招标人信息");
        contacts(facts, text, "agent", "(?:采购代理机构|招标代理机构)(?:信息)?", "代理信息");
        return facts;
    }
    private static void contacts(List<Map<String, String>> facts, String text, String role, String label, String section) {
        String header = "(?m)^\\h*(?:[0-9一二三四五六七八九十]+[.、．]\\h*)?" + label;
        single(facts, text, role, header + "[：:]\\h*([^\\r\\n\\t：:]{2,120})", section);
        Pattern block = Pattern.compile(header + "(?:[：:]|\\h*$)[\\s\\S]{0,700}?(?=\\n\\h*(?:[0-9一二三四五六七八九十]+[.、．]\\h*)?(?:采购人|招标人|采购代理机构|招标代理机构|项目联系方式|监督部门)|\\z)");
        var matcher = block.matcher(text);
        List<String> blocks = new ArrayList<>();
        while (matcher.find()) { blocks.add(matcher.group()); }
        if (blocks.size() != 1) { return; }
        String value = blocks.getFirst();
        if (value.contains("\t")) { return; }
        int firstLine = value.indexOf('\n');
        if (firstLine >= 0 && Pattern.compile("(?:采购人|招标人|采购代理机构|招标代理机构)(?:信息)?")
                .matcher(value.substring(firstLine + 1)).find()) { return; }
        if (facts.stream().noneMatch(f -> f.get("field").equals(role))) {
            single(facts, value, role, "(?m)^\\h*名\\h*称[：:]\\h*([^\\r\\n\\t：:]{2,120})", section);
        }
        single(facts, value, role + "_contact", "(?m)^\\h*联\\h*系\\h*人[：:]\\h*([^\\r\\n]{1,50})", section);
        single(facts, value, role + "_phone", "(?m)^\\h*(?:电\\h*话|联系方式|联系电话)[：:]\\h*([0-9+（）() —-]{7,35})", section);
    }
    private static void single(List<Map<String, String>> facts, String text, String key, String regex, String section) {
        var matcher = Pattern.compile(regex).matcher(text);
        List<Map<String, String>> found = new ArrayList<>();
        while (matcher.find()) {
            String value = matcher.group(1).strip().replaceAll("[\\p{Z}]+$", "");
            if (!value.isBlank() && found.stream().noneMatch(item -> value.equals(item.get("value")))) {
                found.add(Map.of("field", key, "value", value, "evidence", matcher.group(), "section", section));
            }
        }
        if (found.size() == 1) { facts.add(found.getFirst()); }
    }
}
