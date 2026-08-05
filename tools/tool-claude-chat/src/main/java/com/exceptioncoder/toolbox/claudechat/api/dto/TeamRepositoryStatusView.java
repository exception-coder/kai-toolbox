package com.exceptioncoder.toolbox.claudechat.api.dto;

/** 团队依赖 Git 仓库的本地与远端同步状态。 */
public record TeamRepositoryStatusView(
        String name, boolean cloned, String source, boolean sourceMatches,
        String commit, String commitDate, Long lastSyncedAt,
        Integer behind, Integer ahead, boolean dirty, boolean remoteChecked) {
}
