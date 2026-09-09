package com.exceptioncoder.toolbox.procurement.service;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementStructureStore;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementValueTypes;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementStructure.*;

/** 字段配置约束、带来源的结果投影及人工覆盖，独立于网页采集。 */
@Service
public class ProcurementStructureService {
    private static final Set<String> SYSTEM_KEYS = Set.of("notice_id", "title", "source_url", "source");
    private final ProcurementStructureStore structures;
    private final ProcurementStore notices;
    private final ObjectMapper mapper;

    public ProcurementStructureService(ProcurementStructureStore structures, ProcurementStore notices, ObjectMapper mapper) {
        this.structures = structures;
        this.notices = notices;
        this.mapper = mapper;
    }

    public Schema schema() { return structures.schema(); }

    public Schema save(Schema draft) {
        Schema current = schema();
        if (draft.version() != current.version()) { throw new IllegalArgumentException("数据结构已被修改，请刷新后重试"); }
        if (draft.fields() == null || draft.fields().isEmpty() || draft.fields().size() > 150) {
            throw new IllegalArgumentException("数据结构需要 1 至 150 个字段");
        }
        Map<String, Field> existing = current.fields().stream().collect(Collectors.toMap(Field::key, Function.identity()));
        Set<String> keys = new HashSet<>();
        for (Field field : draft.fields()) {
            if (field == null || field.key() == null || !field.key().matches("[a-z][a-z0-9_]{0,79}") || !keys.add(field.key())
                    || !text(field.label(), 100) || !text(field.group(), 80) || field.description() == null || field.description().length() > 2000
                    || field.type() == null || !Set.of("TEXT", "DECIMAL", "DATE").contains(field.type())
                    || field.mode() == null || !Set.of("SYSTEM", "LLM", "MANUAL").contains(field.mode())
                    || field.order() < 0 || field.order() > 10000) {
                throw new IllegalArgumentException("字段定义不合法，请检查键、名称、分组、类型和排序");
            }
            Field previous = existing.get(field.key());
            if (previous != null && !previous.type().equals(field.type())) {
                throw new IllegalArgumentException("已有字段类型不可修改，请新增字段并停用旧字段");
            }
            if (SYSTEM_KEYS.contains(field.key()) != "SYSTEM".equals(field.mode())) {
                throw new IllegalArgumentException("系统字段提取方式固定，新增字段请选择智能解析或人工维护");
            }
            if (Set.of("notice_stage", "scope_type").contains(field.key()) && !"TEXT".equals(field.type())) {
                throw new IllegalArgumentException("分类字段必须使用文本类型");
            }
        }
        if (!keys.containsAll(existing.keySet())) { throw new IllegalArgumentException("已有字段不可删除，请停用以保留历史数据"); }
        return structures.save(new Schema(draft.version(), draft.fields().stream()
                .sorted(Comparator.comparingInt(Field::order).thenComparing(Field::key)).toList()));
    }

    public Result result(String noticeId) {
        var notice = notices.notice(noticeId);
        Schema schema = schema();
        Overrides overrides = structures.overrides(noticeId);
        Map<String, String> dictionary = notices.rules().stream().collect(Collectors.toMap(r -> r.id(), r -> r.name()));
        return project(notice, schema, overrides, dictionary);
    }

    /** 一页只读一次结构、规则和修正，不加载页面 HTML。 */
    public Map<String, Object> businessPage(com.exceptioncoder.toolbox.procurement.domain.ProcurementData.NoticeQuery query) {
        var page = notices.notices(query);
        var schema = schema();
        var overrides = structures.overrides(page.items().stream().map(n -> n.id()).toList());
        var dictionary = notices.rules().stream().collect(Collectors.toMap(r -> r.id(), r -> r.name()));
        var rows = page.items().stream().map(notice -> {
            var result = project(notice, schema, overrides.getOrDefault(notice.id(), new Overrides(0, Map.of())), dictionary);
            Map<String, String> values = new LinkedHashMap<>();
            result.values().forEach(value -> values.put(value.field().key(), value.value()));
            var summary = new com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Notice(
                    notice.id(), notice.siteId(), notice.url(), notice.title(), notice.captureStatus(), notice.parseStatus(),
                    "", notice.finalUrl(), notice.frameUrl(), notice.httpStatus(), notice.capturedAt(), notice.error(),
                    "{}", "{}", "{}", notice.runId(), notice.updateTime());
            return Map.of("notice", summary, "values", values);
        }).toList();
        return Map.of("fields", schema.fields().stream().filter(Field::enabled).toList(), "items", rows,
                "total", page.total(), "page", page.page(), "pageSize", page.pageSize());
    }

    /** 在同一个数据库快照中投影全部匹配业务记录，避免分页期间数据变动。 */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public List<Result> exportResults(String search, String siteId, String status) {
        var schema = schema();
        var dictionary = notices.rules().stream().collect(Collectors.toMap(r -> r.id(), r -> r.name()));
        List<Result> results = new ArrayList<>();
        for (int index = 0; ; index++) {
            var page = notices.notices(new com.exceptioncoder.toolbox.procurement.domain.ProcurementData.NoticeQuery(search, siteId, status, index, true));
            if (page.total() > 50000) { throw new IllegalArgumentException("导出最多支持 50000 条，请缩小筛选范围"); }
            var overrides = structures.overrides(page.items().stream().map(n -> n.id()).toList());
            page.items().forEach(notice -> results.add(project(notice, schema,
                    overrides.getOrDefault(notice.id(), new Overrides(0, Map.of())), dictionary)));
            if (results.size() >= page.total() || page.items().isEmpty()) { return results; }
        }
    }

    private Result project(com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Notice notice,
                           Schema schema, Overrides overrides, Map<String, String> dictionary) {
        JsonNode analysis = read(notice.analysis());
        Set<String> codeFields = new HashSet<>();
        analysis.path("codeFields").forEach(value -> codeFields.add(value.asText()));
        Map<String, String> system = Map.of("notice_id", notice.id(), "title", notice.title(), "source_url", notice.url(), "source", notice.siteId());
        List<Value> values = new ArrayList<>();
        for (Field field : schema.fields()) {
            if (!field.enabled()) { continue; }
            List<Map<String, String>> evidence = new ArrayList<>();
            List<String> alternatives = new ArrayList<>();
            for (JsonNode fact : analysis.path("facts")) {
                if (!field.key().equals(fact.path("field").asText())) { continue; }
                String raw = fact.path("value").asText();
                String value;
                try { value = ProcurementValueTypes.normalize(field, raw, true); }
                catch (IllegalArgumentException e) { continue; }
                value = dictionary.getOrDefault(value, value);
                if (!alternatives.contains(value)) { alternatives.add(value); }
                evidence.add(Map.of("value", value, "raw", raw, "evidence", fact.path("evidence").asText(), "section", fact.path("section").asText()));
            }
            String automatic = system.getOrDefault(field.key(), alternatives.size() == 1 ? alternatives.getFirst() : "");
            boolean overridden = overrides.values().containsKey(field.key());
            String source = overridden ? "MANUAL" : system.containsKey(field.key()) ? "SYSTEM"
                    : alternatives.size() > 1 ? "CONFLICT" : !automatic.isBlank()
                    ? codeFields.contains(field.key()) ? "CODE" : "LLM" : "EMPTY";
            values.add(new Value(field, overridden ? overrides.values().get(field.key()) : automatic, source,
                    evidence, alternatives, overridden));
        }
        return new Result(schema.version(), analysis.path("schemaVersion").asInt(0), overrides.version(), values, overrides.values());
    }

    public Result correct(String noticeId, Correction correction) {
        notices.notice(noticeId);
        Schema schema = schema();
        if (schema.version() != correction.schemaVersion()) { throw new IllegalArgumentException("数据结构已被修改，请刷新后重试"); }
        if (correction.values() == null || correction.values().size() > 150 || correction.version() < 0) {
            throw new IllegalArgumentException("人工修正格式不合法");
        }
        Map<String, Field> fields = schema.fields().stream().collect(Collectors.toMap(Field::key, Function.identity()));
        Map<String, String> normalized = new LinkedHashMap<>();
        Map<String, String> existing = structures.overrides(noticeId).values();
        correction.values().forEach((key, value) -> {
            Field field = fields.get(key);
            if (field == null || "SYSTEM".equals(field.mode())) { throw new IllegalArgumentException("字段不存在或由系统维护：" + key); }
            if (!field.enabled() && !java.util.Objects.equals(value, existing.get(key))) {
                throw new IllegalArgumentException("已停用字段不可修改：" + field.label());
            }
            normalized.put(key, ProcurementValueTypes.normalize(field, value, false));
        });
        // 停用仅隐藏字段；保存其他字段时仍保留其历史人工修正。
        existing.forEach((key, value) -> { if (fields.containsKey(key) && !fields.get(key).enabled()) { normalized.put(key, value); } });
        structures.saveOverrides(noticeId, new Correction(correction.schemaVersion(), correction.version(), normalized));
        return result(noticeId);
    }

    private boolean text(String value, int limit) { return value != null && !value.isBlank() && value.length() <= limit; }
    private JsonNode read(String json) {
        try { return mapper.readTree(json); }
        catch (java.io.IOException e) { throw new IllegalStateException("公告解析数据损坏", e); }
    }
}
