package com.exceptioncoder.toolbox.claudechat.api.dto;

/** 业务系统聚合工作区内一个固定 Git 仓库的状态。 */
public record BusinessRepositoryStatusView(
        String name,
        String path,
        String repositoryUrl,
        boolean cloned,
        boolean sourceMatches,
        String branch,
        String commit,
        String commitDate,
        Integer behind,
        Integer ahead,
        boolean dirty,
        boolean remoteChecked,
        boolean syncable,
        String status,
        String message,
        BusinessOpenSpecStatusView openSpec) {
}
