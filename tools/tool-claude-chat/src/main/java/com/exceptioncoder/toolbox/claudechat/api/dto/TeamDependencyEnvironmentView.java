package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/** 团队依赖安装所需的本机命令行环境。 */
public record TeamDependencyEnvironmentView(String os, boolean ready, List<ToolView> tools) {
    public record ToolView(String id, String name, boolean installed, String version,
                           String installCommand, String officialUrl) {
    }
}
