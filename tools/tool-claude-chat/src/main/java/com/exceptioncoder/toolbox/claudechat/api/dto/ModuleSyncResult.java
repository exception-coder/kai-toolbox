package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 「更新项目模块」应用结果。
 *
 * @param appended    实际追加的模块数
 * @param skipped     跳过数（key 冲突或字段缺失）
 * @param modulesFile 写入的 modules.json 绝对路径
 */
public record ModuleSyncResult(int appended, int skipped, String modulesFile) {
}
