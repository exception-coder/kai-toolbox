package com.exceptioncoder.toolbox.docviewer.api.dto;

import com.exceptioncoder.toolbox.docviewer.repository.entity.DocSource;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class SourceDTO {
    private String id;
    private String owner;
    private String repo;
    private String ref;
    private String subPath;
    private String alias;
    private boolean hasPat;
    private String treeETag;
    private Long rateLimitUntil;
    private long lastRefreshedAt;
    private long createdAt;

    public static SourceDTO of(DocSource s) {
        return SourceDTO.builder()
                .id(s.getId())
                .owner(s.getOwner())
                .repo(s.getRepo())
                .ref(s.getRefName())
                .subPath(s.getSubPath())
                .alias(s.getAlias())
                .hasPat(s.getPat() != null && !s.getPat().isBlank())
                .treeETag(s.getTreeETag())
                .rateLimitUntil(s.getRateLimitUntil())
                .lastRefreshedAt(s.getLastRefreshedAt())
                .createdAt(s.getCreatedAt())
                .build();
    }
}
