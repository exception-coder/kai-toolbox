package com.exceptioncoder.toolbox.docviewer.api.dto;

import com.exceptioncoder.toolbox.docviewer.repository.entity.DocTreeNode;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TreeNodeDTO {
    private String path;
    private String name;
    private String kind;
    private String sha;
    private Long size;
    private String parentPath;
    private int depth;

    public static TreeNodeDTO of(DocTreeNode n) {
        return TreeNodeDTO.builder()
                .path(n.getPath())
                .name(n.getName())
                .kind(n.getKind())
                .sha(n.getSha())
                .size(n.getSize())
                .parentPath(n.getParentPath())
                .depth(n.getDepth())
                .build();
    }
}
