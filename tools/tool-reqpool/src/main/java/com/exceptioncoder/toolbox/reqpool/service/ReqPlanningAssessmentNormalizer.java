package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessmentStandard;
import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessmentStandard.Confidence;
import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessmentStandard.HourRange;
import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessmentStandard.WorkPackageType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/** 校验模型规划建议，并以固定准则确定性汇总工时。 */
@Component
public class ReqPlanningAssessmentNormalizer {

    private static final int MAX_TEXT_LENGTH = 1_000;
    private static final int MAX_ARRAY_ITEMS = 20;

    private final ObjectMapper mapper;

    public ReqPlanningAssessmentNormalizer(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * 将不可信模型 JSON 归一化为可落库评估结果。
     *
     * @param rawOutput 模型原始输出
     * @return 服务端重算后的 JSON
     */
    public String normalize(String rawOutput) {
        JsonNode root = parse(rawOutput);
        ArrayNode sourceCapabilities = requireArray(root, "capabilities");
        if (sourceCapabilities.isEmpty()
                || sourceCapabilities.size() > ReqPlanningAssessmentStandard.MAX_CAPABILITIES) {
            throw new IllegalArgumentException("capabilities 数量必须为 1-"
                    + ReqPlanningAssessmentStandard.MAX_CAPABILITIES);
        }

        ObjectNode normalized = mapper.createObjectNode();
        normalized.put("criteriaVersion", ReqPlanningAssessmentStandard.CRITERIA_VERSION);
        normalized.put("effectiveHoursPerPersonDay",
                ReqPlanningAssessmentStandard.EFFECTIVE_HOURS_PER_PERSON_DAY);
        normalized.put("summary", requiredText(root, "summary", MAX_TEXT_LENGTH));
        normalized.set("assumptions", stringArray(root.path("assumptions")));
        NormalizedCapabilities capabilities = normalizeCapabilities(sourceCapabilities);
        normalized.set("firstTestRelease", normalizeFirstTestRelease(
                root.path("firstTestRelease"), capabilities));
        normalized.put("confidence", capabilities.confidence().name());
        normalized.put("hoursMin", capabilities.hoursMin());
        normalized.put("hoursMax", capabilities.hoursMax());
        normalized.put("personDaysMin",
                ReqPlanningAssessmentStandard.personDays(capabilities.hoursMin()));
        normalized.put("personDaysMax",
                ReqPlanningAssessmentStandard.personDays(capabilities.hoursMax()));
        normalized.set("capabilities", capabilities.items());
        try {
            return mapper.writeValueAsString(normalized);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("规划评估归一化结果序列化失败", error);
        }
    }

    private NormalizedCapabilities normalizeCapabilities(ArrayNode source) {
        ArrayNode items = mapper.createArrayNode();
        Set<String> ids = new HashSet<>();
        int hoursMin = 0;
        int hoursMax = 0;
        int baseHoursMax = 0;
        Confidence overallConfidence = Confidence.HIGH;
        for (int index = 0; index < source.size(); index++) {
            ObjectNode item = normalizeCapability(source.get(index), ids, index + 1);
            items.add(item);
            hoursMin += item.path("hoursMin").asInt();
            hoursMax += item.path("hoursMax").asInt();
            baseHoursMax += item.path("baseHoursMax").asInt();
            overallConfidence = lowerConfidence(
                    overallConfidence, Confidence.valueOf(item.path("confidence").asText()));
        }
        if (baseHoursMax > ReqPlanningAssessmentStandard.MAX_TOTAL_BASE_HOURS) {
            throw new IllegalArgumentException("全部业务功能基础工时上界不能超过 "
                    + ReqPlanningAssessmentStandard.MAX_TOTAL_BASE_HOURS
                    + " 小时；请合并重复功能并仅计算一次共享成本");
        }
        return new NormalizedCapabilities(items, hoursMin, hoursMax, overallConfidence);
    }

    private ObjectNode normalizeFirstTestRelease(JsonNode source, NormalizedCapabilities capabilities) {
        if (!source.isObject()) {
            throw new IllegalArgumentException("firstTestRelease 必须是对象");
        }
        ArrayNode requestedIds = requireArray(source, "capabilityIds");
        if (requestedIds.isEmpty()) {
            throw new IllegalArgumentException("firstTestRelease.capabilityIds 至少包含一个能力 ID");
        }

        Map<String, JsonNode> capabilitiesById = new LinkedHashMap<>();
        for (JsonNode capability : capabilities.items()) {
            capabilitiesById.put(capability.path("id").asText(), capability);
        }

        Set<String> selectedIds = new LinkedHashSet<>();
        ArrayNode normalizedIds = mapper.createArrayNode();
        int hoursMin = 0;
        int hoursMax = 0;
        Confidence confidence = Confidence.HIGH;
        for (JsonNode requestedId : requestedIds) {
            String id = requestedId.asText("").trim();
            JsonNode capability = capabilitiesById.get(id);
            if (capability == null) {
                throw new IllegalArgumentException("firstTestRelease 引用了未知能力 ID: " + id);
            }
            if (!selectedIds.add(id)) {
                throw new IllegalArgumentException("firstTestRelease 能力 ID 重复: " + id);
            }
            normalizedIds.add(id);
            hoursMin += capability.path("hoursMin").asInt();
            hoursMax += capability.path("hoursMax").asInt();
            confidence = lowerConfidence(
                    confidence, Confidence.valueOf(capability.path("confidence").asText()));
        }

        ObjectNode target = mapper.createObjectNode();
        target.put("scope", requiredText(source, "scope", MAX_TEXT_LENGTH));
        target.set("capabilityIds", normalizedIds);
        target.set("acceptanceChecks", requiredStringArray(
                source.path("acceptanceChecks"), "firstTestRelease.acceptanceChecks"));
        target.set("deferredScope", stringArray(source.path("deferredScope")));
        target.put("confidence", confidence.name());
        target.put("hoursMin", hoursMin);
        target.put("hoursMax", hoursMax);
        target.put("workingDaysMin", ReqPlanningAssessmentStandard.personDays(hoursMin));
        target.put("workingDaysMax", ReqPlanningAssessmentStandard.personDays(hoursMax));
        return target;
    }

    private ObjectNode normalizeCapability(JsonNode source, Set<String> ids, int position) {
        String id = requiredText(source, "id", 40);
        if (!ids.add(id)) {
            throw new IllegalArgumentException("capability id 重复: " + id);
        }
        Confidence confidence = enumValue(source, "confidence", Confidence.class);
        WorkPackageSummary work = normalizeWorkPackages(requireArray(source, "workPackages"));
        if (work.hoursMax() > ReqPlanningAssessmentStandard.MAX_CAPABILITY_BASE_HOURS) {
            throw new IllegalArgumentException("第 " + position + " 个业务功能基础工时上界不能超过 "
                    + ReqPlanningAssessmentStandard.MAX_CAPABILITY_BASE_HOURS + " 小时");
        }
        int bufferedMax = applyBuffer(work.hoursMax(), confidence);

        ObjectNode target = mapper.createObjectNode();
        target.put("id", id);
        target.put("domain", requiredText(source, "domain", 120));
        target.put("name", requiredText(source, "name", 160));
        target.put("businessOutcome", requiredText(source, "businessOutcome", MAX_TEXT_LENGTH));
        target.put("scope", requiredBusinessText(
                source, "scope", MAX_TEXT_LENGTH, "第 " + position + " 个领域功能的范围说明（scope）"));
        target.set("specRefs", stringArray(source.path("specRefs")));
        target.set("evidenceRefs", stringArray(source.path("evidenceRefs")));
        target.set("dependencies", stringArray(source.path("dependencies")));
        target.set("risks", stringArray(source.path("risks")));
        target.put("confidence", confidence.name());
        target.put("bufferRate", ReqPlanningAssessmentStandard.bufferRate(confidence));
        target.put("baseHoursMin", work.hoursMin());
        target.put("baseHoursMax", work.hoursMax());
        target.put("hoursMin", work.hoursMin());
        target.put("hoursMax", bufferedMax);
        target.set("workPackages", work.items());
        return target;
    }

    private WorkPackageSummary normalizeWorkPackages(ArrayNode source) {
        EnumMap<WorkPackageType, JsonNode> byType = new EnumMap<>(WorkPackageType.class);
        for (JsonNode workPackage : source) {
            WorkPackageType type = enumValue(workPackage, "type", WorkPackageType.class);
            if (byType.put(type, workPackage) != null) {
                throw new IllegalArgumentException("工作包类型重复: " + type);
            }
        }
        if (byType.size() != WorkPackageType.values().length) {
            throw new IllegalArgumentException("每个功能必须完整返回六类工作包");
        }

        ArrayNode items = mapper.createArrayNode();
        int hoursMin = 0;
        int hoursMax = 0;
        for (WorkPackageType type : WorkPackageType.values()) {
            JsonNode sourceItem = byType.get(type);
            int minimum = boundedHours(sourceItem, "hoursMin", type);
            int maximum = boundedHours(sourceItem, "hoursMax", type);
            if (minimum > maximum) {
                throw new IllegalArgumentException(type + " 的 hoursMin 不能大于 hoursMax");
            }
            ObjectNode item = mapper.createObjectNode();
            item.put("type", type.name());
            item.put("hoursMin", minimum);
            item.put("hoursMax", maximum);
            item.put("reason", requiredText(sourceItem, "reason", MAX_TEXT_LENGTH));
            items.add(item);
            hoursMin += minimum;
            hoursMax += maximum;
        }
        return new WorkPackageSummary(items, hoursMin, hoursMax);
    }

    private int boundedHours(JsonNode source, String field, WorkPackageType type) {
        JsonNode value = source.path(field);
        if (!value.isIntegralNumber()) {
            throw new IllegalArgumentException(type + "." + field + " 必须是整数");
        }
        int hours = value.asInt();
        HourRange range = ReqPlanningAssessmentStandard.range(type);
        if (hours < range.minimum() || hours > range.maximum()) {
            throw new IllegalArgumentException(type + "." + field + " 超出准则范围 "
                    + range.minimum() + "-" + range.maximum());
        }
        return hours;
    }

    private JsonNode parse(String rawOutput) {
        String value = stripFence(rawOutput == null ? "" : rawOutput.trim());
        try {
            JsonNode node = mapper.readTree(value);
            if (node == null || !node.isObject()) {
                throw new IllegalArgumentException("模型输出必须是 JSON 对象");
            }
            return node;
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("规划评估 JSON 解析失败: " + error.getOriginalMessage(), error);
        }
    }

    private ArrayNode requireArray(JsonNode source, String field) {
        JsonNode value = source.path(field);
        if (!(value instanceof ArrayNode array)) {
            throw new IllegalArgumentException(field + " 必须是数组");
        }
        return array;
    }

    private ArrayNode stringArray(JsonNode source) {
        ArrayNode result = mapper.createArrayNode();
        if (!source.isArray()) {
            return result;
        }
        int count = 0;
        for (JsonNode item : source) {
            if (count >= MAX_ARRAY_ITEMS) {
                break;
            }
            String value = item.asText("").trim();
            if (!value.isEmpty()) {
                result.add(value.length() > MAX_TEXT_LENGTH ? value.substring(0, MAX_TEXT_LENGTH) : value);
                count++;
            }
        }
        return result;
    }

    private ArrayNode requiredStringArray(JsonNode source, String field) {
        ArrayNode values = stringArray(source);
        if (values.isEmpty()) {
            throw new IllegalArgumentException(field + " 至少包含一项");
        }
        return values;
    }

    private static String requiredText(JsonNode source, String field, int maximumLength) {
        String value = source.path(field).asText("").trim();
        if (value.isEmpty() || value.length() > maximumLength) {
            throw new IllegalArgumentException(field + " 不能为空且长度不能超过 " + maximumLength);
        }
        return value;
    }

    private static String requiredBusinessText(
            JsonNode source,
            String field,
            int maximumLength,
            String label
    ) {
        String value = source.path(field).asText("").trim();
        if (value.isEmpty()) {
            throw new IllegalArgumentException(label + "缺失");
        }
        if (value.length() > maximumLength) {
            throw new IllegalArgumentException(label + "超过 " + maximumLength
                    + " 字（实际 " + value.length() + " 字）");
        }
        return value;
    }

    private static <T extends Enum<T>> T enumValue(JsonNode source, String field, Class<T> type) {
        String value = requiredText(source, field, 80);
        try {
            return Enum.valueOf(type, value);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException(field + " 包含不支持的值: " + value, error);
        }
    }

    private static int applyBuffer(int baseHoursMax, Confidence confidence) {
        BigDecimal multiplier = BigDecimal.ONE.add(ReqPlanningAssessmentStandard.bufferRate(confidence));
        return BigDecimal.valueOf(baseHoursMax)
                .multiply(multiplier)
                .setScale(0, RoundingMode.CEILING)
                .intValueExact();
    }

    private static Confidence lowerConfidence(Confidence left, Confidence right) {
        return left.ordinal() >= right.ordinal() ? left : right;
    }

    private static String stripFence(String value) {
        if (!value.startsWith("```")) {
            return value;
        }
        int firstLineEnd = value.indexOf('\n');
        int lastFence = value.lastIndexOf("```");
        return firstLineEnd >= 0 && lastFence > firstLineEnd
                ? value.substring(firstLineEnd + 1, lastFence).trim()
                : value;
    }

    private record WorkPackageSummary(ArrayNode items, int hoursMin, int hoursMax) {
    }

    private record NormalizedCapabilities(
            ArrayNode items,
            int hoursMin,
            int hoursMax,
            Confidence confidence
    ) {
    }
}
