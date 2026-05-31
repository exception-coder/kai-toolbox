package com.exceptioncoder.toolbox.browserrequest.domain.enums;

/** 录制状态机：RECORDING → STOPPED / AUTO_STOPPED / ABANDONED。终态后不再变。 */
public enum RecordingStatus {
    /** 正在录制（onResponse 监听挂在 ctx 上）。 */
    RECORDING,
    /** 用户主动停止 / session 被关闭触发停止。 */
    STOPPED,
    /** 触达硬上限（时长或调用数）自动停止。 */
    AUTO_STOPPED,
    /** 应用启动时发现旧的 RECORDING 行（上次进程异常退出），统一标记为 ABANDONED 不可续录。 */
    ABANDONED
}
