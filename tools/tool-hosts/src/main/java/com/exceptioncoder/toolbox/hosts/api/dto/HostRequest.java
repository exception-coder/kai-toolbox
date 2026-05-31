package com.exceptioncoder.toolbox.hosts.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 创建 / 更新主机时的入参。
 *
 * <p>密码 / passphrase 留空表示「保持原值」（编辑场景）。新建场景下密码必填、
 * 密钥模式 privateKey 必填；具体校验在 service 里执行。
 */
public record HostRequest(
        @NotBlank String name,
        @NotBlank String host,
        Integer port,
        @NotBlank String username,
        @NotNull String authType,
        String password,
        String privateKey,
        String passphrase,
        String tag,
        String note
) {}
