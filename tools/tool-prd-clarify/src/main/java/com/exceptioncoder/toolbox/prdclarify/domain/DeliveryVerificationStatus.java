package com.exceptioncoder.toolbox.prdclarify.domain;

/** 手动构建或测试验证运行的持久化状态。 */
public enum DeliveryVerificationStatus {

    /** 已登记，外部进程尚未结束。 */
    RUNNING,

    /** 进程正常退出且退出码为 0。 */
    SUCCEEDED,

    /** 进程正常退出但退出码非 0。 */
    FAILED,

    /** 进程无法启动、超时或服务端读取失败。 */
    ERROR
}
