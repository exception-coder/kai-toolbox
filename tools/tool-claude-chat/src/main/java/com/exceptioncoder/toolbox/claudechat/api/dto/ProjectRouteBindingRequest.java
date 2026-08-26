package com.exceptioncoder.toolbox.claudechat.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 保存本机项目路由绑定的请求。
 *
 * @param projectPath Forge 受控工作区一级项目路径
 * @param aliases 项目或系统别名
 */
public record ProjectRouteBindingRequest(
        @NotBlank String projectPath,
        @Size(max = 12) List<@Size(max = 100) String> aliases
) {
}
