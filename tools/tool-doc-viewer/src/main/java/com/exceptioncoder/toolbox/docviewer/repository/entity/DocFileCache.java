package com.exceptioncoder.toolbox.docviewer.repository.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocFileCache {
    private String sha;
    /** BLOB | BINARY */
    private String kind;
    private long size;
    private String content;
    private long cachedAt;
}
