package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.DocumentProfile;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdBusinessFields;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.UUID;

/**
 * PRD 会话生命周期服务，负责会话创建、草稿转换和持久化删除。
 */
@Service
public class PrdSessionLifecycleService {

    private static final String STATUS_CLARIFYING = "CLARIFYING";
    private static final String STATUS_DRAFT = "DRAFT";
    private static final String ROLE_BUSINESS = "BUSINESS";
    private static final String ROLE_PRODUCT = "PRODUCT";
    private static final String CLARIFY_MODE_BATCH = "batch";
    private static final String CLARIFY_MODE_PROGRESSIVE = "progressive";

    private final PrdSessionRepository repository;
    private final PrdFileStore fileStore;
    private final PrdRequirementTypeResolver requirementTypeResolver;

    public PrdSessionLifecycleService(
            PrdSessionRepository repository,
            PrdFileStore fileStore,
            PrdRequirementTypeResolver requirementTypeResolver
    ) {
        this.repository = repository;
        this.fileStore = fileStore;
        this.requirementTypeResolver = requirementTypeResolver;
    }

    /** 创建正式会话并进入澄清状态。 */
    public PrdSession create(
            String title,
            String rawInput,
            String project,
            String module,
            String model,
            String engine,
            String role,
            String reqType,
            Integer maxQuestions,
            Long createdByUserId,
            String clarifyMode,
            PrdBusinessFields businessFields,
            String parentId,
            String documentProfile
    ) {
        long now = System.currentTimeMillis();
        PrdBusinessFields fields = normalizeBusinessFields(businessFields);
        String effectiveEngine = normalizeEngine(engine);
        String effectiveParentId = normalizeParentId(parentId);
        validateParent(effectiveParentId);
        PrdRequirementTypeResolver.Resolution classification = requirementTypeResolver.resolve(
                title, rawInput, model, effectiveEngine, reqType, maxQuestions);

        PrdSession session = baseSession(title, rawInput, project, module, fields)
                .id(UUID.randomUUID().toString())
                .model(model)
                .engine(effectiveEngine)
                .role(normalizeRole(role))
                .reqType(classification.reqType())
                .maxQuestions(classification.maxQuestions())
                .clarifyMode(normalizeClarifyMode(clarifyMode))
                .documentProfile(DocumentProfile.normalize(documentProfile))
                .status(STATUS_CLARIFYING)
                .createdByUserId(createdByUserId)
                .parentId(effectiveParentId)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repository.insert(session);
        return session;
    }

    /** 保存尚未进入澄清流程的会话草稿。 */
    public PrdSession saveDraft(
            String title,
            String rawInput,
            String project,
            String module,
            Long createdByUserId,
            PrdBusinessFields businessFields,
            String documentProfile
    ) {
        long now = System.currentTimeMillis();
        PrdSession session = baseSession(
                title, rawInput == null ? "" : rawInput, project, module, normalizeBusinessFields(businessFields))
                .id(UUID.randomUUID().toString())
                .role(ROLE_PRODUCT)
                .reqType(PrdRequirementTypeResolver.NEW_MODULE)
                .maxQuestions(PrdRequirementTypeResolver.defaultMaxQuestions(PrdRequirementTypeResolver.NEW_MODULE))
                .clarifyMode(CLARIFY_MODE_PROGRESSIVE)
                .documentProfile(DocumentProfile.normalize(documentProfile))
                .status(STATUS_DRAFT)
                .createdByUserId(createdByUserId)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repository.insert(session);
        return session;
    }

    /** 更新仍处于草稿状态的会话。 */
    public PrdSession updateDraft(
            String sessionId,
            String title,
            String rawInput,
            String project,
            String module,
            PrdBusinessFields businessFields,
            String documentProfile
    ) {
        PrdSession existing = requireSession(sessionId);
        requireDraft(existing, "不是草稿，无法这样保存");
        String effectiveDocumentProfile = documentProfile == null
                ? existing.getDocumentProfile()
                : documentProfile;
        repository.updateDraftFields(
                sessionId,
                title,
                rawInput == null ? "" : rawInput,
                project,
                module,
                businessFields,
                effectiveDocumentProfile);
        return requireSession(sessionId);
    }

    /** 将已有草稿原地转换为正式澄清会话。 */
    public PrdSession startClarifyFromDraft(
            String sessionId,
            String title,
            String rawInput,
            String project,
            String module,
            String model,
            String engine,
            String role,
            String reqType,
            Integer maxQuestions,
            String clarifyMode,
            PrdBusinessFields businessFields,
            String documentProfile
    ) {
        PrdSession existing = requireSession(sessionId);
        requireDraft(existing, "不是草稿，不能重复发起澄清");
        String effectiveEngine = normalizeEngine(engine);
        PrdRequirementTypeResolver.Resolution classification = requirementTypeResolver.resolve(
                title, rawInput, model, effectiveEngine, reqType, maxQuestions);
        String effectiveDocumentProfile = documentProfile == null
                ? existing.getDocumentProfile()
                : documentProfile;
        repository.startClarifyFromDraft(
                sessionId,
                title,
                rawInput,
                project,
                module,
                model,
                effectiveEngine,
                normalizeRole(role),
                classification.reqType(),
                classification.maxQuestions(),
                normalizeClarifyMode(clarifyMode),
                businessFields,
                effectiveDocumentProfile);
        return requireSession(sessionId);
    }

    /** 删除会话数据库记录及兼容主文件。 */
    public void delete(String sessionId) throws IOException {
        repository.delete(sessionId);
        fileStore.delete(sessionId);
    }

    private PrdSession.PrdSessionBuilder baseSession(
            String title,
            String rawInput,
            String project,
            String module,
            PrdBusinessFields fields
    ) {
        return PrdSession.builder()
                .title(title)
                .rawInput(rawInput)
                .project(project)
                .module(module)
                .requirementDetail(fields.requirementDetail())
                .businessBackground(fields.businessBackground())
                .businessRequirementType(fields.businessRequirementType())
                .requirementSoftware(fields.requirementSoftware())
                .initiatingDepartment(fields.initiatingDepartment())
                .requester(fields.requester())
                .requestedAt(fields.requestedAt())
                .attachments(fields.attachments())
                .followUpRecords(fields.followUpRecords());
    }

    private PrdSession requireSession(String sessionId) {
        return repository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
    }

    private void requireDraft(PrdSession session, String message) {
        if (!STATUS_DRAFT.equals(session.getStatus())) {
            throw new IllegalStateException("当前状态 " + session.getStatus() + " " + message);
        }
    }

    private void validateParent(String parentId) {
        if (parentId != null && repository.findById(parentId).isEmpty()) {
            throw new IllegalArgumentException("父 PRD 会话不存在: " + parentId);
        }
    }

    private static PrdBusinessFields normalizeBusinessFields(PrdBusinessFields businessFields) {
        return businessFields == null ? PrdBusinessFields.empty() : businessFields;
    }

    private static String normalizeRole(String role) {
        return ROLE_BUSINESS.equalsIgnoreCase(role) ? ROLE_BUSINESS : ROLE_PRODUCT;
    }

    private static String normalizeClarifyMode(String clarifyMode) {
        return CLARIFY_MODE_BATCH.equals(clarifyMode) ? CLARIFY_MODE_BATCH : CLARIFY_MODE_PROGRESSIVE;
    }

    private static String normalizeParentId(String parentId) {
        return parentId == null || parentId.isBlank() ? null : parentId.trim();
    }

    private static String normalizeEngine(String engine) {
        if (engine == null || engine.isBlank() || "claude".equalsIgnoreCase(engine)) {
            return "claude";
        }
        if ("codex".equalsIgnoreCase(engine)) {
            return "codex";
        }
        throw new IllegalArgumentException("不支持的 Agent 引擎: " + engine);
    }
}
