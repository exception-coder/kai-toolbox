package com.exceptioncoder.toolbox.videocondense.domain;

/** 作业状态机：PENDING→ANALYZING→ANALYZED→RENDERING→DONE，任意阶段可 →FAILED/CANCELLED。 */
public enum JobStatus {
    PENDING,
    ANALYZING,
    ANALYZED,
    RENDERING,
    DONE,
    FAILED,
    CANCELLED;

    public boolean isTerminal() {
        return this == DONE || this == FAILED || this == CANCELLED;
    }
}
