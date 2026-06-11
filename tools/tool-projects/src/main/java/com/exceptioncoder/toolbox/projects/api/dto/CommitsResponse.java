package com.exceptioncoder.toolbox.projects.api.dto;

import java.util.List;

/** 提交列表响应。 */
public record CommitsResponse(List<CommitInfo> commits) {
}
