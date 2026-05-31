package com.exceptioncoder.toolbox.magnet.domain;

/**
 * 任务对外状态。直接从 aria2 的 status 字段映射，不重建状态机。
 * aria2 自带 active/waiting/paused/error/complete/removed 六态。
 */
public enum MagnetTaskState {

    /** waiting：在队列中等待 */
    QUEUED,
    /** active：正在下载 */
    ACTIVE,
    /** paused：用户主动暂停 */
    PAUSED,
    /** complete：完成 */
    COMPLETED,
    /** error：失败 */
    FAILED,
    /** removed：已删除 / 取消 */
    REMOVED;

    public static MagnetTaskState fromAria2(String aria2Status) {
        if (aria2Status == null) return QUEUED;
        return switch (aria2Status.toLowerCase()) {
            case "active" -> ACTIVE;
            case "waiting" -> QUEUED;
            case "paused" -> PAUSED;
            case "complete" -> COMPLETED;
            case "error" -> FAILED;
            case "removed" -> REMOVED;
            default -> QUEUED;
        };
    }
}
