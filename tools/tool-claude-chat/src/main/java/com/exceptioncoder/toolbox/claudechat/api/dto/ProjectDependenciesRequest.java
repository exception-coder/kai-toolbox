package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 以给定顺序完整替换主项目关系；paths 保留旧客户端兼容。
 *
 * @param paths 旧版依赖路径列表
 * @param dependencies 带关系语义的依赖列表
 */
public record ProjectDependenciesRequest(
        List<String> paths,
        List<ProjectDependencyInput> dependencies
) {
}
