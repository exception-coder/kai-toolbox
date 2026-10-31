package com.exceptioncoder.toolbox.common.git;

/** 仓库中可浏览的分支引用；head 为空表示当前分支尚无提交。 */
public record GitBranchRef(String ref, String name, String head, boolean current, boolean remote) {
}
