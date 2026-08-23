package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/** 以给定顺序完整替换主项目的长期依赖。 */
public record ProjectDependenciesRequest(List<String> paths) {
}
