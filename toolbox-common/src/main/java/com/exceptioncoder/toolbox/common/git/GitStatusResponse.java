package com.exceptioncoder.toolbox.common.git;

import java.util.List;

/** git status 查询结果。 */
public record GitStatusResponse(List<GitStatusEntry> entries) {}
