package com.exceptioncoder.toolbox.prdclarify.domain;

/** 一次 PRD AI 调用的审计状态。 */
public enum PrdAiRunStatus {
    /** 已登记但尚未得到可裁决输出。 */
    RUNNING,
    /** 运行成功且输出通过调用方契约校验。 */
    SUCCEEDED,
    /** 运行异常或输出未通过调用方契约校验。 */
    FAILED
}
