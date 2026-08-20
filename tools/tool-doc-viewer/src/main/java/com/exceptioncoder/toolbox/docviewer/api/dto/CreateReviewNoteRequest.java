package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.Data;

@Data
public class CreateReviewNoteRequest {
    private String filePath;
    private String headingId;
    private String headingText;
    private Integer headingLevel;
    private String category;
    private String content;
}
