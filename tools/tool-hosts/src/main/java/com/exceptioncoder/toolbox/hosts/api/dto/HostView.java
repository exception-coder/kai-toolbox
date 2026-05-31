package com.exceptioncoder.toolbox.hosts.api.dto;

import com.exceptioncoder.toolbox.hosts.domain.Host;
import com.exceptioncoder.toolbox.hosts.domain.HostAuthType;

/**
 * 主机视图：不会回传 password / passphrase 明文，只暴露「是否已配置」位。
 * 前端编辑时把这两个字段留空 → 后端在 service 里识别为「保持原值」。
 */
public record HostView(
        String id,
        String name,
        String host,
        int port,
        String username,
        String authType,
        String privateKey,
        boolean passwordConfigured,
        boolean passphraseConfigured,
        String tag,
        String note,
        long createdAt,
        long updatedAt,
        String label
) {
    public static HostView from(Host h) {
        return new HostView(
                h.getId(),
                h.getName(),
                h.getHost(),
                h.getPort(),
                h.getUsername(),
                (h.getAuthType() == null ? HostAuthType.PASSWORD : h.getAuthType()).name(),
                h.getPrivateKey(),
                h.getPassword() != null && !h.getPassword().isBlank(),
                h.getPassphrase() != null && !h.getPassphrase().isBlank(),
                h.getTag(),
                h.getNote(),
                h.getCreatedAt(),
                h.getUpdatedAt(),
                h.label()
        );
    }
}
