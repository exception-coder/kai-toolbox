package com.exceptioncoder.toolbox.procurement.service;

import com.exceptioncoder.toolbox.procurement.domain.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/** 版本化经验样例复用生产校验，回归记录与公告业务数据隔离。 */
@Service
public class ProcurementExperienceService {
    private final ObjectMapper mapper;
    private final ProcurementParsingService parsing;
    private final ProcurementStructureStore structures;
    private final ProcurementStore store;
    private final ProcurementCacheStore records;
    private final JsonNode catalog;

    public ProcurementExperienceService(ObjectMapper mapper, ProcurementParsingService parsing,
            ProcurementStructureStore structures, ProcurementStore store, ProcurementCacheStore records) {
        this.mapper = mapper;
        this.parsing = parsing;
        this.structures = structures;
        this.store = store;
        this.records = records;
        try (var input = new ClassPathResource("procurement/experiences.json").getInputStream()) {
            catalog = mapper.readTree(input);
        } catch (java.io.IOException e) { throw new IllegalStateException("解析经验目录无法读取", e); }
    }
    public JsonNode catalog() { return catalog.deepCopy(); }

    public JsonNode regress() {
        var schema = structures.schema();
        var rules = store.rules().stream().filter(r -> Boolean.TRUE.equals(r.enabled())).toList();
        var allowed = schema.fields().stream().filter(f -> f.enabled() && "LLM".equals(f.mode()))
                .map(ProcurementStructure.Field::key).collect(Collectors.toSet());
        var result = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                .put("createdAt", Instant.now().toString()).put("catalogVersion", catalog.path("version").asText())
                .put("ruleVersion", ProcurementFieldReview.VERSION).put("schemaVersion", schema.version());
        result.set("schemaSnapshot", mapper.valueToTree(schema));
        result.set("ruleSnapshot", mapper.valueToTree(rules));
        var outcomes = result.putArray("outcomes");
        int passed = 0;
        for (var rule : catalog.path("rules")) {
            for (var example : rule.path("examples")) {
                if (!example.has("fact")) { continue; }
                var row = outcomes.addObject().put("ruleId", rule.path("id").asText())
                        .put("exampleId", example.path("id").asText());
                row.set("example", example.deepCopy());
                String text = example.path("text").asText();
                var input = mapper.createObjectNode().set("facts", mapper.createArrayNode().add(example.path("fact")));
                var report = new ProcurementFieldReview(mapper).review(input, text, allowed,
                        value -> parsing.validate(value, text, rules, schema));
                String actual = report.path("facts").isEmpty() ? "REJECT" : "ACCEPT";
                String value = "";
                if (actual.equals("ACCEPT")) {
                    var fact = report.path("facts").get(0);
                    var field = schema.fields().stream().filter(f -> f.key().equals(fact.path("field").asText())).findFirst().orElseThrow();
                    value = ProcurementValueTypes.normalize(field, fact.path("value").asText(), true);
                }
                boolean match = actual.equals(example.path("expected").asText())
                        && (!actual.equals("ACCEPT") || value.equals(example.path("expectedValue").asText()));
                row.put("actual", actual).put("actualValue", value).put("passed", match).set("review", report);
                if (match) { passed++; }
            }
        }
        result.put("passed", passed).put("total", outcomes.size());
        records.saveExampleRun(result.path("id").asText(), result.path("createdAt").asText(), result.toString());
        result.remove(List.of("schemaSnapshot", "ruleSnapshot"));
        return result;
    }
    public List<JsonNode> history() {
        return records.exampleRuns().stream().map(value -> {
            try {
                var result = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(value);
                result.remove(List.of("schemaSnapshot", "ruleSnapshot"));
                return (JsonNode) result;
            }
            catch (java.io.IOException e) { throw new IllegalStateException("回归记录损坏", e); }
        }).toList();
    }
}
