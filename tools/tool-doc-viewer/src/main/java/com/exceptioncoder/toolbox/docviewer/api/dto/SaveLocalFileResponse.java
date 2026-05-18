package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaveLocalFileResponse {
    private String sourceId;
    private String path;
    private long size;
    private long lastModified;
}
