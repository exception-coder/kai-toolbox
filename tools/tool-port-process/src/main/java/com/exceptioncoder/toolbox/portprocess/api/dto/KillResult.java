package com.exceptioncoder.toolbox.portprocess.api.dto;

/**
 * 终止进程的返回结果。
 * killed 仅以子进程 exitCode==0 为判定依据；killed=false 时调用方可看 stderr 判断原因
 * （常见：进程已不存在、权限不足）。
 */
public record KillResult(
        long pid,
        boolean killed,
        String os,
        String command,
        int exitCode,
        String stdout,
        String stderr,
        long elapsedMs
) {}
