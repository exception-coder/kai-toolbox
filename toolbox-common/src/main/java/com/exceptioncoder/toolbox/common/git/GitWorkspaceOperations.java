package com.exceptioncoder.toolbox.common.git;

import java.nio.file.Path;

/** 仓库状态与安全切换端口；调用方负责授权仓库身份。 */
public interface GitWorkspaceOperations {
    GitWorkspaceStatus status(Path repository, boolean refreshRemote);
    GitBranchSwitchPreview prepareSwitch(Path repository, String ref);
    String switchBranch(Path repository, String ref, String token);
}
