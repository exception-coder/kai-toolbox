package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.common.development.RequirementDevelopmentAccessPolicy;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import org.springframework.stereotype.Component;

/** 需求负责人授权的事实源：只认稳定的 assignee_user_id，不按展示姓名猜账号。 */
@Component
public class ReqDevelopmentAccessPolicy implements RequirementDevelopmentAccessPolicy {

    private final ReqItemRepository repository;

    public ReqDevelopmentAccessPolicy(ReqItemRepository repository) {
        this.repository = repository;
    }

    @Override
    public boolean canDevelop(long userId, String prdSessionId) {
        return repository.findByPrdSessionId(prdSessionId)
                .map(item -> item.getAssigneeUserId() != null && item.getAssigneeUserId() == userId)
                .orElse(false);
    }

}
