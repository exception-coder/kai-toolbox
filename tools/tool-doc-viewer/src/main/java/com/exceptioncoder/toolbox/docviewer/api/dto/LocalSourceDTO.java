package com.exceptioncoder.toolbox.docviewer.api.dto;

import com.exceptioncoder.toolbox.docviewer.repository.entity.LocalDocSource;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LocalSourceDTO {
    private String id;
    private String alias;
    private String rootPath;
    private long lastVisitedAt;
    private long createdAt;

    public static LocalSourceDTO of(LocalDocSource s) {
        return LocalSourceDTO.builder()
                .id(s.getId())
                .alias(s.getAlias())
                .rootPath(s.getRootPath())
                .lastVisitedAt(s.getLastVisitedAt())
                .createdAt(s.getCreatedAt())
                .build();
    }
}
