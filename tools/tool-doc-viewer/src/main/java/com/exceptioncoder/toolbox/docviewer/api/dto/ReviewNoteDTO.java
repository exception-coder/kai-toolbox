package com.exceptioncoder.toolbox.docviewer.api.dto;

import com.exceptioncoder.toolbox.docviewer.repository.entity.DocReviewNote;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ReviewNoteDTO {
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

    public static ReviewNoteDTO from(DocReviewNote note) {
        return ReviewNoteDTO.builder()
                .id(note.getId())
                .sourceId(note.getSourceId())
                .filePath(note.getFilePath())
                .headingId(note.getHeadingId())
                .headingText(note.getHeadingText())
                .headingLevel(note.getHeadingLevel())
                .category(note.getCategory())
                .content(note.getContent())
                .status(note.getStatus())
                .createdAt(note.getCreatedAt())
                .updatedAt(note.getUpdatedAt())
                .build();
    }
}
