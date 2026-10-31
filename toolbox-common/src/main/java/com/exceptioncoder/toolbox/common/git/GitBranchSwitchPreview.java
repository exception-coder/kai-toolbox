package com.exceptioncoder.toolbox.common.git;

/** 确认切换的固定源、目标版本及新建本地跟踪关系。 */
public record GitBranchSwitchPreview(String branch, String head, String ref, String targetHead,
                                      String localBranch, String tracking, String token) { }
