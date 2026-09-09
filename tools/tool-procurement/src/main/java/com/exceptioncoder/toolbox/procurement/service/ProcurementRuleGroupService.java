package com.exceptioncoder.toolbox.procurement.service;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Rule;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;

/** 目的分组保留原词条追溯，独立保存共用规则；运行快照不再重复包含被合并的词条。 */
@Service
public class ProcurementRuleGroupService {
    public record Definition(String id, String name, String kind, String targets, List<String> members,
                             String logic, String boundary) { }
    public record Group(Rule rule, String kind, List<Rule> sources) { }
    private final ProcurementStore store;
    private final List<Definition> definitions;

    public ProcurementRuleGroupService(ProcurementStore store, ObjectMapper mapper) throws IOException {
        this.store = store;
        try (var input = new ClassPathResource("procurement/rule-groups.json").getInputStream()) {
            definitions = mapper.readValue(input, new TypeReference<>() { });
        }
    }

    public List<Group> groups() { return groups(store.rules()); }

    private List<Group> groups(List<Rule> all) {
        var byId = all.stream().collect(Collectors.toMap(Rule::id, r -> r));
        var groups = new ArrayList<Group>();
        Set<String> assigned = new HashSet<>();
        for (var definition : definitions) {
            assigned.addAll(definition.members());
            var sources = definition.members().stream().map(byId::get).filter(Objects::nonNull).toList();
            var terms = sources.stream().filter(r -> Boolean.TRUE.equals(r.enabled())
                    && Set.of("KEYWORD", "NEGATIVE").contains(r.category()))
                    .map(r -> r.name() + (r.fields().getOrDefault("同义词/变体", "").isBlank() ? ""
                            : " / " + r.fields().get("同义词/变体"))).distinct().collect(Collectors.joining("；"));
            var defaults = new Rule(definition.id(), "GROUP", definition.name(), true,
                    Map.of("适用字段", definition.targets(), "词组", terms,
                            "判定规则", definition.logic(), "边界条件", definition.boundary()));
            groups.add(new Group(byId.getOrDefault(definition.id(), defaults), definition.kind(), sources));
        }
        // 未知自定义词条仍可查看和参与解析，不能因默认分组未覆盖而消失。
        all.stream().filter(r -> !assigned.contains(r.id()) && !"GROUP".equals(r.category()))
                .forEach(r -> groups.add(new Group(r, "自定义规则", List.of(r))));
        return groups;
    }

    public Rule save(String id, Rule input) {
        if (definitions.stream().noneMatch(d -> d.id().equals(id))) { throw new IllegalArgumentException("分组不存在"); }
        if (input.name() == null || input.name().isBlank() || input.name().length() > 300 || input.fields() == null
                || !input.fields().keySet().equals(Set.of("适用字段", "词组", "判定规则", "边界条件"))
                || input.fields().values().stream().anyMatch(v -> v == null || v.length() > 12000)
                || !input.fields().get("适用字段").matches("\\*|[a-z][a-z0-9_]*(,[a-z][a-z0-9_]*)*")) {
            throw new IllegalArgumentException("分组名称、适用字段或判定内容不合法（字段用英文逗号分隔）");
        }
        var rule = new Rule(id, "GROUP", input.name().trim(), Boolean.TRUE.equals(input.enabled()), Map.copyOf(input.fields()));
        store.saveRule(rule);
        return rule;
    }

    /** 固定本批次合并后的规则与字典，避免解析过程中读取变化的规则。 */
    public List<Rule> snapshot() {
        var result = new ArrayList<Rule>();
        for (var group : groups()) {
            if (!Boolean.TRUE.equals(group.rule().enabled())) { continue; }
            result.add(group.rule());
            if ("分类字典".equals(group.kind())) {
                group.sources().stream().filter(r -> Boolean.TRUE.equals(r.enabled())).forEach(result::add);
            }
        }
        return List.copyOf(result);
    }

    /** 每轮仅携带目标字段的规则。历史输入的未分组规则保持兼容。 */
    public static List<Rule> select(List<Rule> rules, Set<String> fields) {
        return rules.stream().filter(r -> Boolean.TRUE.equals(r.enabled())).filter(r -> {
            if ("DICTIONARY".equals(r.category())) {
                return r.id().startsWith("STG_") ? fields.contains("notice_stage")
                        : r.id().startsWith("SCP_") ? fields.contains("scope_type") : true;
            }
            String targets = r.fields().getOrDefault("适用字段", "*");
            return "*".equals(targets) || Arrays.stream(targets.split(",")).anyMatch(fields::contains);
        }).toList();
    }
}
