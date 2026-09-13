package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.projects.registry.domain.TopologyKnowledge.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 核对关系端点和引用归属；文本语义仍保留为候选。 */
@Component
public class TopologyResultValidator {
    public static final int MAX_OUTPUT_CHARACTERS = 100_000;
    private final ObjectMapper json;

    public TopologyResultValidator(ObjectMapper json) { this.json = json; }

    public Result validate(String output, List<Participant> participants) {
        require(output != null && output.length() <= MAX_OUTPUT_CHARACTERS, "关系结果为空或超过上限");
        String text = output.replace("\r\n", "\n").strip();
        if (text.startsWith("```json\n") && text.endsWith("```")) {
            text = text.substring(8, text.length() - 3).strip();
        }
        Result result;
        try {
            result = json.readerFor(Result.class).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .with(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
                    .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT).readValue(text);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("请只输出约定的跨项目关系 JSON", exception);
        }
        require(result != null && result.relations() != null && result.relations().size() <= 30,
                "跨项目关系最多 30 条");
        strings(result.gaps(), "覆盖缺口");
        require(!result.relations().isEmpty() || !result.gaps().isEmpty(), "没有关系时必须说明证据缺口");
        Set<String> ids = new HashSet<>();
        for (Relation relation : result.relations()) {
            validateRelation(relation, participants);
            require(ids.add(relation.id()), "关系 ID 重复");
        }
        return result;
    }

    private void validateRelation(Relation relation, List<Participant> participants) {
        require(relation != null && relation.id() != null && relation.id().matches("[a-z][a-z0-9-]{0,79}"),
                "关系 ID 必须是英文短标识");
        var selected = participants.stream().map(Participant::projectId).collect(java.util.stream.Collectors.toSet());
        require(selected.contains(relation.fromProjectId()) && selected.contains(relation.toProjectId())
                && !relation.fromProjectId().equals(relation.toProjectId()), "关系必须连接两个选中的不同项目");
        require(Set.of("API", "DATA", "DEPENDENCY", "FLOW").contains(value(relation.kind())), "关系类型无效");
        require(Set.of("HIGH", "MEDIUM", "LOW").contains(value(relation.confidence())), "置信度无效");
        require(relation.summary() != null && !relation.summary().isBlank() && relation.summary().length() <= 2000,
                "关系摘要为空或过长");
        strings(relation.unknowns(), "待核实事项");
        require(relation.evidence() != null && relation.evidence().size() >= 2 && relation.evidence().size() <= 20,
                "每条关系需要 2–20 条引用");
        Set<String> cited = new HashSet<>();
        for (Citation citation : relation.evidence()) {
            validateCitation(citation, participants);
            require(citation.projectId().equals(relation.fromProjectId())
                    || citation.projectId().equals(relation.toProjectId()), "引用必须来自关系两端");
            cited.add(citation.projectId());
        }
        require(cited.contains(relation.fromProjectId()) && cited.contains(relation.toProjectId()),
                "关系两端都必须有源码证据");
    }

    private void validateCitation(Citation citation, List<Participant> participants) {
        require(citation != null && citation.projectId() != null && citation.domainId() != null
                && citation.evidenceIndex() != null && citation.evidenceIndex() >= 0, "引用字段不完整");
        var participant = participants.stream().filter(item -> item.projectId().equals(citation.projectId()))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("引用了未选中的项目"));
        var domain = participant.findings().domains().stream().filter(item -> item.id().equals(citation.domainId()))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("引用了不存在的领域证据"));
        require(citation.evidenceIndex() < domain.evidence().size(), "源码引用序号越界");
    }

    private static void strings(List<String> values, String label) {
        require(values != null && values.size() <= 30, label + "最多 30 条");
        for (String text : values) {
            require(text != null && !text.isBlank() && text.length() <= 2000, label + "为空或过长");
        }
    }

    private static String value(String text) { return text == null ? "" : text; }
    private static void require(boolean valid, String message) {
        if (!valid) { throw new IllegalArgumentException(message); }
    }
}
