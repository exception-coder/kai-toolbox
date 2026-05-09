package com.exceptioncoder.toolbox.docviewer.repository.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocSource {
    private String id;
    private String owner;
    private String repo;
    private String refName;
    private String subPath;
    private String refSha;
    private String alias;
    private String pat;
    private String treeETag;
    private Long rateLimitUntil;
    private long lastRefreshedAt;
    private long createdAt;
}
