package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantContextSnapshot;
import com.exceptioncoder.toolbox.assistant.domain.AssistantDraft;
import com.exceptioncoder.toolbox.assistant.domain.AssistantIntentResult;
import com.exceptioncoder.toolbox.assistant.domain.AssistantRegistration;
import com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort;
import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.List;

/** 将 Assistant 应用服务适配为统一 WS 可调用的稳定端口。 */
@Component
public class AssistantCapabilityAdapter implements AssistantCapabilityPort {

    private final AssistantIntentRouter intentRouter;
    private final AssistantContextService contextService;
    private final AssistantModuleContextService moduleContextService;
    private final AssistantDraftService draftService;
    private final ObjectProvider<AuthUserRepository> userRepositoryProvider;

    public AssistantCapabilityAdapter(AssistantIntentRouter intentRouter,
                                      AssistantContextService contextService,
                                      AssistantModuleContextService moduleContextService,
                                      AssistantDraftService draftService,
                                      ObjectProvider<AuthUserRepository> userRepositoryProvider) {
        this.intentRouter = intentRouter;
        this.contextService = contextService;
        this.moduleContextService = moduleContextService;
        this.draftService = draftService;
        this.userRepositoryProvider = userRepositoryProvider;
    }

    @Override
    public IntentResult routeIntent(String mode, String text) {
        AssistantIntentResult result = intentRouter.route(mode, text);
        return new IntentResult(result.intent().name(), result.confidence(), result.reason());
    }

    @Override
    public SnapshotResult saveContext(String sessionId, String protocolVersion, Object snapshot) {
        AssistantContextSnapshot result = contextService.save(sessionId, protocolVersion, snapshot);
        return new SnapshotResult(result.id(), result.createTime());
    }

    @Override
    public ModuleContextResult resolveModuleContext(String appId, String moduleKey,
                                                    String route, String sourceRevision) {
        AssistantModuleContextService.ResolveResult result = moduleContextService.resolve(
                appId, moduleKey, route, sourceRevision);
        return new ModuleContextResult(result.found(), result.summary(), result.sourceRevision(),
                result.updatedAt(), result.expiresAt());
    }

    @Override
    public ModuleContextSaveResult saveModuleContext(String appId, String moduleKey, String route,
                                                     String sourceRevision, String summary) {
        AssistantModuleContextService.SaveResult result = moduleContextService.save(
                appId, moduleKey, route, sourceRevision, summary);
        return new ModuleContextSaveResult(result.moduleKey(), result.updatedAt(), result.expiresAt());
    }

    @Override
    public DraftResult createDraft(String sessionId, String kind, String title, String description,
                                   Object contextSnapshot, Object evidence) {
        AssistantDraft draft = draftService.create(new AssistantDraftService.CreateDraftCommand(
                sessionId, kind, title, description, contextSnapshot, evidence));
        return new DraftResult(draft.id(), draft.status());
    }

    @Override
    public RegistrationResult confirmDraft(String draftId, String idempotencyKey, Long engineerUserId) {
        AssistantRegistration result = draftService.confirm(draftId, idempotencyKey, engineerUserId);
        return new RegistrationResult(result.draftId(), result.requirementId(), result.status(), result.alreadySaved());
    }

    @Override
    public List<UserOption> listAssignableUsers() {
        AuthUserRepository repository = userRepositoryProvider.getIfAvailable();
        if (repository == null) {
            return List.of();
        }
        return repository.findAll().stream()
                .filter(AuthUser::isEnabled)
                .map(user -> new UserOption(user.getId(), user.getUsername(), user.getRealName()))
                .toList();
    }
}
