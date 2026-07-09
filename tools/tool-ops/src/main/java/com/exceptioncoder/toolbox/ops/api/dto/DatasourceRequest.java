package com.exceptioncoder.toolbox.ops.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 创建 / 更新中间件实例的入参。
 * password 留空表示「保持原值」（编辑场景）。
 */
public record DatasourceRequest(
        @NotBlank String systemId,
        @NotBlank String env,
        @NotNull String type,
        @NotBlank String name,
        @NotBlank String host,
        Integer port,
        String username,
        String password,
        String dbName,
        String params,
        String note,
        Integer sortOrder
) {}
