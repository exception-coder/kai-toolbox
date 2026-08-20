package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantDraft;
import com.exceptioncoder.toolbox.assistant.domain.AssistantRegistration;
import com.exceptioncoder.toolbox.assistant.repository.AssistantDraftRepository;
import com.exceptioncoder.toolbox.assistant.repository.AssistantRegistrationRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationCommand;
import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort;
import com.exceptioncoder.toolbox.common.session.SessionOwnershipPort;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** 编排 Assistant 草稿创建与 ReqPool 幂等确认登记。 */
@Service
public class AssistantDraftService {

    private static final Set<String> SUPPORTED_KINDS = Set.of("BUG", "SUGGESTION");
    private static final String DRAFT = "DRAFT";
    private static final String PENDING_EXECUTION = "PENDING_EXECUTION";
    private static final int MAX_JSON_LENGTH = 64_000;

    private final AssistantDraftRepository draftRepository;
    private final AssistantRegistrationRepository registrationRepository;
    private final RequirementRegistrationPort requirementRegistration;
    private final SessionOwnershipPort sessionOwnership;
    private final ObjectMapper objectMapper;
    private final ObjectProvider<AuthUserRepository> userRepositoryProvider;

    public AssistantDraftService(AssistantDraftRepository draftRepository,
                                 AssistantRegistrationRepository registrationRepository,
                                 RequirementRegistrationPort requirementRegistration,
                                 SessionOwnershipPort sessionOwnership,
                                 ObjectMapper objectMapper,
                                 ObjectProvider<AuthUserRepository> userRepositoryProvider) {
        this.draftRepository = draftRepository;
        this.registrationRepository = registrationRepository;
        this.requirementRegistration = requirementRegistration;
        this.sessionOwnership = sessionOwnership;
        this.objectMapper = objectMapper;
        this.userRepositoryProvider = userRepositoryProvider;
    }

    /** 创建当前用户可编辑的 Bug 或建议草稿。 */
    public AssistantDraft create(CreateDraftCommand command) {
        long userId = currentUserId();
        requireSessionAccess(command.sessionId());
        String kind = normalizeKind(command.kind());
        long now = System.currentTimeMillis();
        AssistantDraft draft = new AssistantDraft(
                UUID.randomUUID().toString(), userId, command.sessionId(), kind,
                requireText(command.title(), "草稿标题不能为空"),
                requireText(command.description(), "草稿描述不能为空"),
                writeJson(command.contextSnapshot()), writeJson(command.evidence()), DRAFT, now, now);
        draftRepository.insert(draft);
        return draft;
    }

    /** 查询本人草稿。 */
    public AssistantDraft get(String draftId) {
        AssistantDraft draft = findDraft(draftId);
        requireCreator(draft);
        return draft;
    }

    /** 原子预占幂等键并登记到 ReqPool。 */
    @Transactional
    public AssistantRegistration confirm(String draftId, String idempotencyKey, Long engineerUserId) {
        validateIdempotencyKey(idempotencyKey);
        validateEngineer(engineerUserId);
        AssistantDraft draft = findDraft(draftId);
        requireCreator(draft);
        requireSessionAccess(draft.sessionId());

        String reservationId = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        if (!registrationRepository.reserve(reservationId, draftId, idempotencyKey, now)) {
            String existingId = registrationRepository.findRequirementId(idempotencyKey, draftId)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT, "相同幂等键正在登记，请稍后重试"));
            return new AssistantRegistration(draftId, existingId, PENDING_EXECUTION, true);
        }

        JsonNode context = readJson(draft.contextSnapshotJson());
        String requirementId = requirementRegistration.registerPendingExecution(new RequirementRegistrationCommand(
                draft.title(), draft.description(), textAt(context, "/application/appId"),
                firstNonBlank(textAt(context, "/page/routeName"), textAt(context, "/businessObject/type")),
                engineerUserId));
        registrationRepository.complete(idempotencyKey, requirementId, now);
        draftRepository.markConfirmed(draftId, now);
        return new AssistantRegistration(draftId, requirementId, PENDING_EXECUTION, false);
    }

    private AssistantDraft findDraft(String draftId) {
        return draftRepository.findById(draftId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "草稿不存在"));
    }

    private void requireCreator(AssistantDraft draft) {
        if (draft.creatorUserId() != currentUserId()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该草稿");
        }
    }

    private void requireSessionAccess(String sessionId) {
        if (!sessionOwnership.canCurrentUserAccess(sessionId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该会话");
        }
    }

    private long currentUserId() {
        return AuthContext.current().map(principal -> principal.userId()).orElse(0L);
    }

    private String normalizeKind(String kind) {
        String normalized = kind == null ? "" : kind.trim().toUpperCase();
        if (!SUPPORTED_KINDS.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "草稿类型只允许 BUG 或 SUGGESTION");
        }
        return normalized;
    }

    private String requireText(String value, String message) {
        if (value == null || value.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        return value.trim();
    }

    private void validateIdempotencyKey(String key) {
        try {
            UUID.fromString(key);
        } catch (RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key 必须是 UUID");
        }
    }

    private void validateEngineer(Long engineerUserId) {
        if (engineerUserId == null) return;
        AuthUserRepository repository = userRepositoryProvider.getIfAvailable();
        if (repository == null || repository.findById(engineerUserId).filter(user -> user.isEnabled()).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "工程师必须是来源系统中的启用注册用户");
        }
    }

    private String writeJson(Object value) {
        try {
            String json = objectMapper.writeValueAsString(value == null ? Map.of() : value);
            if (json.length() > MAX_JSON_LENGTH) {
                throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "上下文或证据超过 64000 字符");
            }
            return json;
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "上下文或证据不是有效 JSON", exception);
        }
    }

    private JsonNode readJson(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("草稿上下文 JSON 已损坏", exception);
        }
    }

    private String textAt(JsonNode node, String pointer) {
        String value = node.at(pointer).asText(null);
        return value == null || value.isBlank() ? null : value;
    }

    private String firstNonBlank(String first, String second) {
        return first != null && !first.isBlank() ? first : second;
    }

    /** 创建草稿命令。 */
    public record CreateDraftCommand(String sessionId, String kind, String title, String description,
                                     Object contextSnapshot, Object evidence) {
    }
}
