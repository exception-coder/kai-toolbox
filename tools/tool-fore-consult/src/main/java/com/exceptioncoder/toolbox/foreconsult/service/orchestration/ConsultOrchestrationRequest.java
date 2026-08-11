package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import java.util.List;

public record ConsultOrchestrationRequest(
        String question,
        String systemName,
        String systemSourcePath,
        List<String> moduleNames,
        String role,
        boolean followUp,
        String evidenceRouteContext
) {
    public ConsultOrchestrationRequest(String question, String systemName, String systemSourcePath,
                                       List<String> moduleNames, String role, boolean followUp) {
        this(question, systemName, systemSourcePath, moduleNames, role, followUp,
                "未命中已确认的跨系统数据归属。");
    }

    public ConsultOrchestrationRequest {
        question = normalize(question, "（用户仅提供了附件，请结合附件识别问题）");
        systemName = normalize(systemName, "未指定系统");
        systemSourcePath = normalize(systemSourcePath, "");
        moduleNames = moduleNames == null
                ? List.of()
                : moduleNames.stream().filter(value -> value != null && !value.isBlank()).map(String::trim).toList();
        role = "BIZ".equalsIgnoreCase(role) ? "BIZ" : "IT";
        evidenceRouteContext = normalize(evidenceRouteContext, "未命中已确认的跨系统数据归属。");
    }

    private static String normalize(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
