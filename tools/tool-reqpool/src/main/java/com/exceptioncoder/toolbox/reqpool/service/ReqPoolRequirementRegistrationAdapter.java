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
        long now = System.currentTimeMillis();
        String id = UUID.randomUUID().toString();
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
}
