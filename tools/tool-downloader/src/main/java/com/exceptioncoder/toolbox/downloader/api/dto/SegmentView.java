package com.exceptioncoder.toolbox.downloader.api.dto;

import com.exceptioncoder.toolbox.downloader.domain.DownloadSegment;

public record SegmentView(
        int seqNo,
        long offset,
        long length,
        long bytesDownloaded,
        String state,
        int attempts) {

    public static SegmentView of(DownloadSegment s) {
        return new SegmentView(
                s.getSeqNo(),
                s.getOffsetBytes(),
                s.getLengthBytes(),
                s.getBytesDownloaded(),
                s.getState().name(),
                s.getAttempts());
    }
}
