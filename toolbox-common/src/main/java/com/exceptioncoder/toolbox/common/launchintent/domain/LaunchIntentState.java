package com.exceptioncoder.toolbox.common.launchintent.domain;

/** 跨页面启动意图的消费状态。 */
public enum LaunchIntentState {
    PENDING,
    ACKED,
    FAILED,
    EXPIRED
}
