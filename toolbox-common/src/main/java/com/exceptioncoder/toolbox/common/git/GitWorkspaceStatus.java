package com.exceptioncoder.toolbox.common.git;

/** 远端核对只对本次刷新有效；本地计数不能证明远端已同步。 */
public record GitWorkspaceStatus(String branch, String head, String upstream, Integer ahead, Integer behind,
                                 int changes, boolean remoteChecked, String checkedAt, String notice) { }
