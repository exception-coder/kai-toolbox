package com.exceptioncoder.toolbox.ffmpeglab.api.dto;

/**
 * 运行某模式的请求体。
 *
 * @param path        本地绝对路径
 * @param mode        模式枚举名
 * @param clipSeconds 截断秒数，null 用默认值，0 表示整片
 */
public record RunRequest(
        String path,
        String mode,
        Integer clipSeconds
) {
}
