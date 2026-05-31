package com.exceptioncoder.toolbox.frp.api.dto;

import com.exceptioncoder.toolbox.frp.domain.FrpHostTarget;

/**
 * 单个 (主机, 角色) 记录的视图。
 * mode 是 "FRPS" / "FRPC"，configJson 是前端 FrpsConfig 或 FrpcConfig 的 JSON 串。
 */
public record FrpTargetView(
        String hostId,
        String mode,
        String installDir,
        String configJson,
        long updatedAt
) {
    public static FrpTargetView from(FrpHostTarget t) {
        return new FrpTargetView(
                t.getHostId(),
                t.getMode().name(),
                t.getInstallDir(),
                t.getConfigJson(),
                t.getUpdatedAt()
        );
    }
}
