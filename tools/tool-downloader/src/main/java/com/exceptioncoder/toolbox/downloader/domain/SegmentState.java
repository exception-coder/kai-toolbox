package com.exceptioncoder.toolbox.downloader.domain;

public enum SegmentState {

    PENDING,
    DOWNLOADING,
    DONE,
    FAILED;

    public boolean isFinishedOrFailed() {
        return this == DONE || this == FAILED;
    }
}
