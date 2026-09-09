package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 校验模型输出的形状、图谱归属与源码原文；不把语义推断升级为业务真理。 */
@Component
public class DomainResultValidator {
    private final ObjectMapper json;
    public DomainResultValidator(ObjectMapper json) { this.json = json; }

    public Result validate(String output, String root, DomainGraphContext.Index graph) {
        require(output != null && output.length() <= 200000, "结果为空或超过 200000 字符");
        String text = output.replace("\r\n", "\n").strip();
        int fence = text.lastIndexOf("```json\n");
        if (fence >= 0 && text.endsWith("```")) { text = text.substring(fence + 8, text.length() - 3).strip(); }
        Result result;
        try {
            result = json.readerFor(Result.class).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .with(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
                    .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT).readValue(text);
        } catch (JsonProcessingException exception) { throw new IllegalArgumentException("请只输出符合约定的领域 JSON", exception); }
        require(result != null && result.domains() != null && !result.domains().isEmpty()
                && result.domains().size() <= 30, "必须提供 1–30 个有源码证据的领域");
        strings(result.gaps(), 30, "未覆盖范围");
        List<Draft> domains = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (Draft draft : result.domains()) {
            require(draft != null && draft.id() != null && draft.id().matches("[a-z][a-z0-9-]{0,79}")
                    && ids.add(draft.id()), "领域 ID 必须是唯一的英文短标识");
            requiredText(draft.name(), 100, "领域名称");
            requiredText(draft.summary(), 2000, "领域职责摘要");
            require(Set.of("BUSINESS", "TECHNICAL").contains(value(draft.kind())), "领域类型必须为 BUSINESS 或 TECHNICAL");
            require(Set.of("HIGH", "MEDIUM", "LOW").contains(value(draft.confidence())), "置信度必须为 HIGH、MEDIUM 或 LOW");
            strings(draft.responsibilities(), 12, "职责");
            strings(draft.flows(), 12, "业务流程");
            strings(draft.unknowns(), 12, "待核实事项");
            require(draft.evidence() != null && !draft.evidence().isEmpty() && draft.evidence().size() <= 15,
                    "每个领域必须提供 1–15 条源码引用");
            Set<String> communities = new java.util.TreeSet<>();
            for (Evidence evidence : draft.evidence()) { communities.add(validateEvidence(evidence, root, graph)); }
            require(draft.mappings() != null && draft.mappings().size() <= 30, "关联映射最多 30 条");
            for (Mapping mapping : draft.mappings()) {
                require(mapping != null && Set.of("ROUTE", "API", "TABLE").contains(value(mapping.kind())), "映射类型无效");
                requiredText(mapping.value(), 500, "映射值");
                require(mapping.evidenceIndex() >= 0 && mapping.evidenceIndex() < draft.evidence().size(), "映射缺少有效证据索引");
            }
            domains.add(new Draft(draft.id(), draft.name(), draft.kind(), draft.summary(), draft.confidence(),
                    draft.responsibilities(), draft.flows(), draft.evidence(), draft.mappings(), draft.unknowns(),
                    List.copyOf(communities)));
        }
        return new Result(List.copyOf(domains), List.copyOf(result.gaps()));
    }

    private String validateEvidence(Evidence evidence, String root, DomainGraphContext.Index graph) {
        require(evidence != null, "源码引用不能为空");
        requiredText(evidence.path(), 500, "源码路径");
        requiredText(evidence.nodeId(), 500, "Graphify 节点 ID");
        requiredText(evidence.quote(), 8000, "源码引用原文");
        require(evidence.startLine() >= 1 && evidence.endLine() >= evidence.startLine()
                && evidence.endLine() - evidence.startLine() < 60, "引用行号无效或超过 60 行");
        DomainGraphContext.Node node = graph.nodes().get(evidence.nodeId());
        require(node != null, "引用节点不在当前 Graphify 图谱中：" + evidence.nodeId());
        try {
            Path base = Path.of(root).toRealPath();
            Path relative = Path.of(evidence.path());
            require(!relative.isAbsolute() && !evidence.path().contains(":"), "源码引用必须使用项目相对路径");
            Path file = base.resolve(relative).normalize().toRealPath();
            require(file.startsWith(base) && Files.isRegularFile(file) && Files.size(file) <= 2 * 1024 * 1024,
                    "源码引用越界、不存在或超过 2 MiB");
            Path graphFile = base.resolve(node.path()).normalize().toRealPath();
            require(file.equals(graphFile), "源码引用与 Graphify 节点路径不一致");
            String normalized = base.relativize(file).toString().replace('\\', '/');
            require(DomainGraphContext.implementationPath(normalized), "领域主证据必须是实现源码，不能是文档");
            require(!normalized.startsWith(".forge/") && !normalized.startsWith(".git/")
                    && !normalized.startsWith("graphify-out/") && !normalized.startsWith("openspec/"),
                    "领域主证据必须来自实现源码");
            List<String> lines = decode(Files.readAllBytes(file)).lines().toList();
            require(evidence.endLine() <= lines.size(), "引用行号超过文件范围");
            String actual = String.join("\n", lines.subList(evidence.startLine() - 1, evidence.endLine()));
            require(actual.equals(evidence.quote().replace("\r\n", "\n")), "源码引用原文不匹配：" + evidence.path());
            return node.community();
        } catch (IOException exception) { throw new IllegalArgumentException("无法核验源码引用：" + evidence.path(), exception); }
    }

    private String decode(byte[] bytes) throws CharacterCodingException {
        try { return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString(); }
        catch (CharacterCodingException exception) {
            return Charset.forName("GB18030").newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        }
    }

    private static void strings(List<String> values, int max, String label) {
        require(values != null && values.size() <= max, label + "数量超限或未提供");
        for (String item : values) { requiredText(item, 2000, label); }
    }
    private static void requiredText(String text, int max, String label) {
        require(text != null && !text.isBlank() && text.length() <= max, label + "缺失或过长");
    }
    private static String value(String text) { return text == null ? "" : text; }
    private static void require(boolean condition, String message) {
        if (!condition) { throw new IllegalArgumentException(message); }
    }
}
