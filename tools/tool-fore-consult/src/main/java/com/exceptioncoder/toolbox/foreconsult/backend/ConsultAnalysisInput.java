package com.exceptioncoder.toolbox.foreconsult.backend;

import java.util.List;

/** Untrusted business data, never execution configuration or platform instructions. */
public record ConsultAnalysisInput(String agentId, String tenantId, String problemId, String conversationId,
        String requestId, String title, String description, List<String> recentContext,
        Classification classification, List<String> systemIds, String errorText,
        List<AttachmentText> attachmentTexts, List<EvidenceRef> evidenceRefs,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_EMPTY) List<String> attachmentIds,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) String replyMode,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) String businessInstructions,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) com.fasterxml.jackson.databind.JsonNode businessContext,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_EMPTY) List<ImageRef> imageRefs,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) String externalUserId) {

    public ConsultAnalysisInput(String agentId, String tenantId, String problemId, String conversationId,
            String requestId, String title, String description, List<String> recentContext,
            Classification classification, List<String> systemIds, String errorText,
            List<AttachmentText> attachmentTexts, List<EvidenceRef> evidenceRefs, List<String> attachmentIds,
            String replyMode, String businessInstructions, com.fasterxml.jackson.databind.JsonNode businessContext,
            List<ImageRef> imageRefs) {
        this(agentId, tenantId, problemId, conversationId, requestId, title, description, recentContext,
                classification, systemIds, errorText, attachmentTexts, evidenceRefs, attachmentIds,
                replyMode, businessInstructions, businessContext, imageRefs, null);
    }

    public static final String AGENT_ID = "it-support-partner";
    public record Classification(String decision, String reason) {}
    public record AttachmentText(String id, String name, String text) {}
    public record EvidenceRef(String projectId, String path, int startLine, int endLine) {}
    public record ImageRef(String id, String sha256, String mediaType) {}

    public boolean forgeReplies() { return "FORGE".equals(replyMode) || flexibleReplies(); }
    public boolean flexibleReplies() { return "FORGE_FLEX".equals(replyMode); }

    /** Pin the admission-time default without changing old stored inputs or their request hashes. */
    public ConsultAnalysisInput withDefaultMode() {
        return replyMode != null ? this : new ConsultAnalysisInput(agentId, tenantId, problemId, conversationId,
                requestId, title, description, recentContext, classification, systemIds, errorText,
                attachmentTexts, evidenceRefs, attachmentIds, "FORGE_FLEX", businessInstructions, businessContext, imageRefs, externalUserId);
    }

    public ConsultAnalysisInput validated() {
        boolean continuous = externalUserId != null;
        String resolvedAgent = continuous && agentId == null ? AGENT_ID : agentId;
        if (!AGENT_ID.equals(resolvedAgent)) throw ConsultBackendException.invalid("agentId 必须为 it-support-partner");
        ConsultBackendAuth.identifier(tenantId, "tenantId");
        if (!continuous || problemId != null) ConsultBackendAuth.identifier(problemId, "problemId");
        if (!continuous || conversationId != null) ConsultBackendAuth.identifier(conversationId, "conversationId");
        if (externalUserId != null) {
            ConsultBackendAuth.identifier(externalUserId, "externalUserId");
            if (replyMode != null && !flexibleReplies()) {
                throw ConsultBackendException.invalid("externalUserId 仅用于 FORGE_FLEX 连续实施答疑");
            }
        }
        if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{8,100}")) throw ConsultBackendException.invalid("requestId 须为 8–100 位字母数字、下划线或短横线");
        text(title, 200, !continuous || title != null); text(description, 12000, true); text(errorText, 12000, false);
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
        var images = list(attachmentIds, 5);
        var externalImages = list(imageRefs, 5);
        if ((!images.isEmpty() && !externalImages.isEmpty())
                || externalImages.stream().map(ImageRef::id).distinct().count() != externalImages.size()) {
            throw ConsultBackendException.invalid("imageRefs 不得与 attachmentIds 混用或包含重复 ID");
        }
        for (var image : externalImages) {
            if (image.id() == null || !image.id().matches("[A-Za-z0-9_-]{1,100}")
                    || image.sha256() == null || !image.sha256().matches("[a-f0-9]{64}")
                    || !("image/png".equals(image.mediaType()) || "image/jpeg".equals(image.mediaType()))) {
                throw ConsultBackendException.invalid("图片引用须提供不透明ID、小写SHA256和PNG/JPEG类型");
            }
        }
        if (images.stream().anyMatch(id -> !id.matches("img_[a-f0-9-]{36}")) || images.stream().distinct().count() != images.size())
            throw ConsultBackendException.invalid("attachmentIds 必须为最多 5 个不重复的上传图片 ID");
        if (replyMode != null && !List.of("CALLER", "FORGE", "FORGE_FLEX").contains(replyMode)) throw ConsultBackendException.invalid("replyMode 必须为 FORGE_FLEX、CALLER 或 FORGE");
        text(businessInstructions, 8000, false);
        if (businessContext != null && (businessContext.isNull() || businessContext.toString().length() > 16000)) {
            throw ConsultBackendException.invalid("businessContext 须为非 null JSON，最多 16000 字符");
        }
        if ((businessInstructions != null || businessContext != null) && replyMode != null && !flexibleReplies()) {
            throw ConsultBackendException.invalid("业务规则和资料仅用于 FORGE_FLEX 模式");
        }
        return new ConsultAnalysisInput(resolvedAgent, tenantId, problemId, conversationId, requestId, title, description,
                context, classification, systems, errorText, attachments, refs, images, replyMode, businessInstructions, businessContext, externalImages, externalUserId);
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
