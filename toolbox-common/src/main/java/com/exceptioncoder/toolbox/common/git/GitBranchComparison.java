package com.exceptioncoder.toolbox.common.git;

/** 本地引用相对于指定来源引用的提交计数；不代表实时远端状态。 */
public record GitBranchComparison(String baseRef, String ref, String baseHead, String head,
                                  long ahead, long behind, String checkedAt) { }
