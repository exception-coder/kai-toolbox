package com.exceptioncoder.toolbox.common.git;

/**
 * git status --porcelain 的单条文件条目。
 * x = index/暂存区状态，y = 工作树状态；空格=未改，M=修改，A=新增，D=删除，R=重命名，?=未跟踪。
 */
public record GitStatusEntry(
        String x,
        String y,
        String path,
        String origPath
) {}
