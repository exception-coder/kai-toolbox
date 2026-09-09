package com.exceptioncoder.toolbox.procurement.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Rule;

/** 仅提取字面候选和上下文，不将裸数字判作项目管线属性。 */
public final class ProcurementCandidates {
    private static final Pattern NUMBERS = Pattern.compile(
            "(?i)(?:DN|SN|φ|Φ|管径)\\s*\\d+(?:\\.\\d+)?(?:\\s*[-—~～至]\\s*\\d+)?"
                    + "|\\d+(?:\\.\\d+)?\\s*(?:公里|千米|万元|亿元|毫米|米|km|mm|m|座|根)");

    private ProcurementCandidates() { }

    /** @param text 原文 @param rules 启用规则 @return 不含最终业务判定的候选 */
    public static Map<String, Object> extract(String text, List<Rule> rules) {
        List<Map<String, Object>> numbers = new ArrayList<>();
        var matcher = NUMBERS.matcher(text);
        while (matcher.find() && numbers.size() < 300) {
            numbers.add(Map.of("raw", matcher.group(), "offset", matcher.start(),
                    "context", text.substring(Math.max(0, matcher.start() - 50),
                            Math.min(text.length(), matcher.end() + 60))));
        }
        List<Map<String, Object>> hits = new ArrayList<>();
        for (Rule rule : rules) {
            if (!Boolean.TRUE.equals(rule.enabled()) || !java.util.Set.of("KEYWORD", "GROUP").contains(rule.category())) { continue; }
            String aliases = rule.fields().getOrDefault("词组", rule.name() + "/" + rule.fields().getOrDefault("同义词/变体", ""));
            String[] words = aliases.split("[/／、；]");
            for (String word : words) {
                int offset = word.isBlank() ? -1 : text.indexOf(word.trim());
                if (offset >= 0) {
                    hits.add(Map.of("ruleId", rule.id(), "word", word.trim(), "offset", offset));
                    break;
                }
            }
        }
        return Map.of("numbers", numbers, "keywordHits", hits, "status", "CANDIDATES_ONLY");
    }
}
