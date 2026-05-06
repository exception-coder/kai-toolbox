package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.SubtitleJob;

public record SubtitleJobView(
        String id,
        String scanId,
        String videoPath,
        String status,
        String model,
        String sourceLanguage,
        double progress,
        boolean hasVtt,
        boolean hasTranslatedVtt,
        String errorMsg,
        long createdAt,
        Long startedAt,
        Long finishedAt
) {
    public static SubtitleJobView from(SubtitleJob j) {
        return new SubtitleJobView(
                j.getId(),
                j.getScanId(),
                j.getVideoPath(),
                j.getStatus().name(),
                j.getModel(),
                j.getSourceLanguage(),
                j.getProgress(),
                j.getVttPath() != null,
                j.getTranslatedVttPath() != null,
                j.getErrorMsg(),
                j.getCreatedAt(),
                j.getStartedAt(),
                j.getFinishedAt()
        );
    }
}
