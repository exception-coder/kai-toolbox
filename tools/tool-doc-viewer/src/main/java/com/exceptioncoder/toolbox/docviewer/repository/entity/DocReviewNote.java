package com.exceptioncoder.toolbox.docviewer.repository.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocReviewNote {
    private String id;
    private String sourceId;
    private String filePath;
    private String headingId;
    private String headingText;
    private int headingLevel;
    private String category;
    private String content;
    private String status;
    private long createdAt;
    private long updatedAt;
}
