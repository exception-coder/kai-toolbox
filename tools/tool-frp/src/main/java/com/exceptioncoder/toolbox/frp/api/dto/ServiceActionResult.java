package com.exceptioncoder.toolbox.frp.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ServiceActionResult {
    /** 实际执行的远端命令 */
    private String command;
    /** 命令退出码 */
    private int exitCode;
    /** 标准输出 */
    private String stdout;
    /** 标准错误 */
    private String stderr;
    /** true 表示 frp 进程当前正在运行（基于 pgrep 二次确认） */
    private boolean running;
    /** 当前匹配到的进程 PID 列表，没有时为空 */
    private String pids;
}
