package com.exceptioncoder.toolbox.claudechat.domain;

/** 会话生命周期状态。 */
public enum SessionStatus {
    /** 当前一轮正在跑 */
    RUNNING,
    /** 空闲，等待用户下条消息 */
    IDLE,
    /** sidecar 崩溃 / 被中断，可 resume */
    INTERRUPTED,
    /** 已正常结束 */
    DONE
}
