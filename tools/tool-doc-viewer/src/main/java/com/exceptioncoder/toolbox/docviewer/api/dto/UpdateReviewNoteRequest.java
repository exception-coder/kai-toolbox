package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.Data;

@Data
public class UpdateReviewNoteRequest {
    private String category;
    private String content;
    private String status;
}
