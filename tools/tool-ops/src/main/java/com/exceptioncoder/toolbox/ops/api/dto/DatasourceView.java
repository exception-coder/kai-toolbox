package com.exceptioncoder.toolbox.ops.api.dto;

import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;

/** 中间件实例视图：不回传密码明文，只给「是否已配置」位。 */
public record DatasourceView(
        String id,
        String systemId,
        String env,
        String type,
        String category,
        boolean queryable,
        String name,
        String host,
        int port,
        String username,
        boolean passwordConfigured,
        String dbName,
        String params,
        String note,
        int sortOrder,
        long createdAt,
        long updatedAt,
        String endpoint
) {
    public static DatasourceView from(OpsDatasource d) {
        return new DatasourceView(
                d.getId(),
                d.getSystemId(),
                d.getEnv(),
                d.getType().name(),
                d.getType().category().name(),
                d.getType().queryable(),
                d.getName(),
                d.getHost(),
                d.getPort(),
                d.getUsername(),
                d.getPassword() != null && !d.getPassword().isBlank(),
                d.getDbName(),
                d.getParams(),
                d.getNote(),
                d.getSortOrder(),
                d.getCreatedAt(),
                d.getUpdatedAt(),
                d.endpoint());
    }
}
