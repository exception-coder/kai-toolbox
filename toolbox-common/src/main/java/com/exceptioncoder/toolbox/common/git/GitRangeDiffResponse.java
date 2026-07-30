package com.exceptioncoder.toolbox.common.git;

import java.util.List;

/** 两个 Git 提交之间的文件清单与统一 diff。 */
public record GitRangeDiffResponse(List<String> changedFiles, String diff, boolean truncated) {
}
