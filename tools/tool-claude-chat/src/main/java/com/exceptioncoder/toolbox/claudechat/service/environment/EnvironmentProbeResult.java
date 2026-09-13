package com.exceptioncoder.toolbox.claudechat.service.environment;

/** @param id 命令标识 @param exitCode 退出码 @param completed 是否正常结束
 * @param output 有界命令输出 @param durationMs 实际执行毫秒数 */
public record EnvironmentProbeResult(String id, Integer exitCode, Boolean completed,
                                     String output, Long durationMs) {
}
