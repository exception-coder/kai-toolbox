package com.exceptioncoder.toolbox.common.forge.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.forge.model.AuditLog;
import com.exceptioncoder.toolbox.common.forge.repository.AuditLogRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/**
 * 权限变更审计（横切原子能力，NFR-07）。操作人取自当前认证主体。
 * 角色 / 绑定 / 用户角色 / 部门变更的 service 在成功修改后调用本服务落审计。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class ForgeAuditService {

    private final AuditLogRepository repository;

    public ForgeAuditService(AuditLogRepository repository) {
        this.repository = repository;
    }

    public void record(String action, String targetType, String targetId, String detail) {
        long operatorId = AuthContext.current().map(AuthPrincipal::userId).orElse(0L);
        repository.insert(AuditLog.builder()
                .operatorId(operatorId)
                .action(action)
                .targetType(targetType)
                .targetId(targetId)
                .detail(detail)
                .createdAt(System.currentTimeMillis())
                .build());
    }
}
