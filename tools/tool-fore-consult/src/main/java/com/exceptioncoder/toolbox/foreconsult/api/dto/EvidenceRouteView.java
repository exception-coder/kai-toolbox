package com.exceptioncoder.toolbox.foreconsult.api.dto;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultEvidenceRoute;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;

/** 跨系统证据归属的管理视图。 */
public record EvidenceRouteView(
        String id,
        String contextSystem,
        String moduleName,
        String businessObject,
        List<String> keywords,
        String evidenceSystem,
        String schemaSource,
        String description,
        List<String> evidenceRefs,
        String status,
        String source,
        long createdAt,
        long updatedAt,
        Long confirmedAt
) {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<String>> STRINGS = new TypeReference<>() { };

    public static EvidenceRouteView from(ConsultEvidenceRoute route) {
        return new EvidenceRouteView(
                route.getId(), route.getContextSystem(), route.getModuleName(), route.getBusinessObject(),
                parse(route.getKeywords()), route.getEvidenceSystem(), route.getSchemaSource(), route.getDescription(),
                parse(route.getEvidenceRefs()), route.getStatus(), route.getSource(), route.getCreatedAt(),
                route.getUpdatedAt(), route.getConfirmedAt());
    }

    private static List<String> parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<String> values = MAPPER.readValue(json, STRINGS);
            return values == null ? List.of() : values;
        } catch (Exception ignored) {
            return List.of();
        }
    }
}
