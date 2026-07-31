package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import java.util.List;

public record ConsultOrchestrationRequest(
        String question,
        String systemName,
        String systemSourcePath,
        List<String> moduleNames,
        String role,
        boolean followUp
) {
    public ConsultOrchestrationRequest {
        question = normalize(question, "（用户仅提供了附件，请结合附件识别问题）");
        systemName = normalize(systemName, "未指定系统");
        systemSourcePath = normalize(systemSourcePath, "");
        moduleNames = moduleNames == null
                ? List.of()
                : moduleNames.stream().filter(value -> value != null && !value.isBlank()).map(String::trim).toList();
        role = "BIZ".equalsIgnoreCase(role) ? "BIZ" : "IT";
    }

    private static String normalize(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
