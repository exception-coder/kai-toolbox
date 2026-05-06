package com.exceptioncoder.toolbox.treesize.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SshHostRequest(
        @NotBlank String name,
        @NotBlank String host,
        Integer port,
        @NotBlank String username,
        @NotNull String authType,
        String password,
        String privateKey,
        String passphrase
) {}
