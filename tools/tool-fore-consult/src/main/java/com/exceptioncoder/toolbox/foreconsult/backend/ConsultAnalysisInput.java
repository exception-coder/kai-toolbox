package com.exceptioncoder.toolbox.foreconsult.backend;

import java.util.List;

/** Untrusted business data, never execution configuration or platform instructions. */
public record ConsultAnalysisInput(String agentId, String tenantId, String problemId, String conversationId,
        String requestId, String title, String description, List<String> recentContext,
        Classification classification, List<String> systemIds, String errorText,
        List<AttachmentText> attachmentTexts, List<EvidenceRef> evidenceRefs) {

    public static final String AGENT_ID = "it-support-partner";
    public record Classification(String decision, String reason) {}
    public record AttachmentText(String id, String name, String text) {}
    public record EvidenceRef(String projectId, String path, int startLine, int endLine) {}

    public ConsultAnalysisInput validated() {
        if (!AGENT_ID.equals(agentId)) throw ConsultBackendException.invalid("agentId 必须为 it-support-partner");
        ConsultBackendAuth.identifier(tenantId, "tenantId");
        ConsultBackendAuth.identifier(problemId, "problemId");
        ConsultBackendAuth.identifier(conversationId, "conversationId");
        if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{8,100}")) throw ConsultBackendException.invalid("requestId 须为 8–100 位字母数字、下划线或短横线");
        text(title, 200, true); text(description, 12000, true); text(errorText, 12000, false);
        var context = list(recentContext, 10);
        context.forEach(s -> text(s, 2000, true));
        var systems = list(systemIds, 8);
        systems.forEach(s -> ConsultBackendAuth.identifier(s, "systemId"));
        if (systems.stream().distinct().count() != systems.size()) throw ConsultBackendException.invalid("systemIds 不得重复");
        if (classification != null) {
            if (!List.of("IT", "NOT_IT", "UNKNOWN").contains(classification.decision())) throw ConsultBackendException.invalid("分类 decision 无效");
            text(classification.reason(), 2000, true);
        }
        var attachments = list(attachmentTexts, 5);
        for (var a : attachments) {
            ConsultBackendAuth.identifier(a.id(), "attachmentId"); text(a.name(), 200, true); text(a.text(), 12000, true);
        }
        var refs = list(evidenceRefs, 8);
        for (var r : refs) {
            ConsultBackendAuth.identifier(r.projectId(), "projectId"); text(r.path(), 300, true);
            if (r.startLine() < 1 || r.endLine() < r.startLine() || r.endLine() - r.startLine() >= 120) throw ConsultBackendException.invalid("源码引用须为 1–120 行");
            if (!systems.contains(r.projectId())) throw ConsultBackendException.invalid("源码引用必须属于 systemIds 中的项目");
        }
        return new ConsultAnalysisInput(agentId, tenantId, problemId, conversationId, requestId, title, description,
                context, classification, systems, errorText, attachments, refs);
    }

    static void text(String value, int max, boolean required) {
        if ((required && (value == null || value.isBlank())) || (value != null && value.length() > max)) throw ConsultBackendException.invalid("文本为空或超过约定长度 " + max);
    }

    private static <T> List<T> list(List<T> value, int max) {
        if (value == null) return List.of();
        if (value.size() > max || value.stream().anyMatch(java.util.Objects::isNull)) throw ConsultBackendException.invalid("列表为空项或超过约定数量 " + max);
        return List.copyOf(value);
    }
}
