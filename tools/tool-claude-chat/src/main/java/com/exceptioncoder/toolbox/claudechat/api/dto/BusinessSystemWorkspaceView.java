package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/** 一个业务系统及其固定成员仓库的聚合状态。 */
public record BusinessSystemWorkspaceView(
        String id,
        String name,
        String workspaceName,
        String workspacePath,
        boolean ready,
        String status,
        String message,
        List<BusinessRepositoryStatusView> members) {
}
