package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.SshAuthType;
import com.exceptioncoder.toolbox.treesize.domain.SshHost;

public record SshHostView(
        String id,
        String name,
        String host,
        int port,
        String username,
        String authType,
        String privateKey,
        boolean passwordConfigured,
        boolean passphraseConfigured,
        long createdAt,
        long updatedAt
) {
    public static SshHostView from(SshHost h) {
        return new SshHostView(
                h.getId(),
                h.getName(),
                h.getHost(),
                h.getPort(),
                h.getUsername(),
                (h.getAuthType() == null ? SshAuthType.PASSWORD : h.getAuthType()).name(),
                h.getPrivateKey(),
                h.getPassword() != null && !h.getPassword().isBlank(),
                h.getPassphrase() != null && !h.getPassphrase().isBlank(),
                h.getCreatedAt(),
                h.getUpdatedAt()
        );
    }
}
