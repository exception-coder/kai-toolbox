package com.exceptioncoder.toolbox.common.forge.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 权限变更审计记录。detail 存变更前后快照（JSON 文本）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLog {
    private Long id;
    private long operatorId;
    private String action;
    private String targetType;
    private String targetId;
    private String detail;
    private long createdAt;
}
