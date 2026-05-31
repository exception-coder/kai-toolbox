package com.exceptioncoder.toolbox.frp.api.dto;

/**
 * upsert 单个 (主机, 角色) 记录的入参。
 * hostId 和 mode 在 URL path 上，body 里只带 installDir + configJson。
 */
public record FrpTargetUpsertRequest(
        String installDir,
        String configJson
) {}
