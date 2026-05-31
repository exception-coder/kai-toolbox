package com.exceptioncoder.toolbox.downloader.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DownloadSegment {

    private long taskId;
    private int seqNo;
    private long offsetBytes;
    private long lengthBytes;
    private long bytesDownloaded;
    private SegmentState state;
    private int attempts;
    private String lastError;
}
