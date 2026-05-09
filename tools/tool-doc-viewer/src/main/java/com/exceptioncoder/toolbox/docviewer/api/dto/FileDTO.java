package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class FileDTO {
    private String sourceId;
    private String path;
    private String sha;
    /** BLOB | BINARY */
    private String kind;
    private long size;
    /** BINARY 时为 null；不因 size 截断 */
    private String content;
    private String rawBaseUrl;
}
