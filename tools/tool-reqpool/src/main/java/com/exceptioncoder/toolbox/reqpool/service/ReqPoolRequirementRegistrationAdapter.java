package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationCommand;
import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** 将已确认的 Assistant 草稿登记为 ReqPool 待执行需求。 */
@Service
public class ReqPoolRequirementRegistrationAdapter implements RequirementRegistrationPort {

    private static final String PENDING_EXECUTION = "PENDING_EXECUTION";
    private static final String DEFAULT_PRIORITY = "MEDIUM";

    private final ReqItemRepository repository;

    public ReqPoolRequirementRegistrationAdapter(ReqItemRepository repository) {
        this.repository = repository;
    }

    @Override
    public String registerPendingExecution(RequirementRegistrationCommand command) {
        return register(UUID.randomUUID().toString(), command);
    }

    @Override
    public String registerPendingExecutionOnce(String sourceKey, RequirementRegistrationCommand command) {
        if (sourceKey == null || sourceKey.isBlank() || sourceKey.length() > 200) throw new IllegalArgumentException("需求来源标识无效");
        String id = UUID.nameUUIDFromBytes(("requirement-source:" + sourceKey).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
        if (repository.findById(id).isPresent()) return id;
        try { return register(id, command); }
        catch (org.springframework.dao.DataIntegrityViolationException conflict) {
            if (repository.findById(id).isPresent()) return id;
            throw conflict;
        }
    }

    private String register(String id, RequirementRegistrationCommand command) {
        long now = System.currentTimeMillis();
        repository.insert(ReqItem.builder()
                .id(id)
                .title(command.title())
                .description(command.description())
                .project(command.project())
                .module(command.module())
                .priority(DEFAULT_PRIORITY)
                .status(PENDING_EXECUTION)
                .assigneeUserId(command.assigneeUserId())
                .createdAt(now)
                .updatedAt(now)
                .build());
        return id;
    }

    @Override
    public void updateImplementationStatus(String sourceKey, String requirementId, ImplementationStatus status) {
        String expected = UUID.nameUUIDFromBytes(("requirement-source:" + sourceKey).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
        if (!expected.equals(requirementId) || status == null) throw new IllegalArgumentException("任务与需求来源不匹配");
        if (!repository.updateImplementationStatus(requirementId, status.name())) throw new IllegalStateException("需求状态已变化，不能继续自动开发");
    }
}
