package com.exceptioncoder.toolbox.docviewer.repository.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocTreeNode {
    private String sourceId;
    private String path;
    private String name;
    /** BLOB | TREE | BINARY */
    private String kind;
    private String sha;
    private Long size;
    private String parentPath;
    private int depth;
}
