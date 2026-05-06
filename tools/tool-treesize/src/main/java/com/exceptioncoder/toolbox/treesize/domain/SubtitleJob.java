package com.exceptioncoder.toolbox.treesize.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SubtitleJob {
    private String id;
    private String scanId;
    private String videoPath;
    /** SHA-1 of the absolute video path. Used as the .vtt filename and as a stable lookup key. */
    private String videoPathHash;
    private SubtitleStatus status;
    /** Free-form model name tag, e.g. "medium" or "large-v3". */
    private String model;
    /** ISO 639-1 code detected by whisper, populated once transcription starts. {@code null} until then. */
    private String sourceLanguage;
    /** 0.0 → 1.0. Updated from whisper.cpp progress lines. */
    private double progress;
    /** Absolute path to the .vtt file once status is COMPLETED. */
    private String vttPath;
    /** Absolute path to the server-translated .zh.vtt file, populated after DeepLX translation. */
    private String translatedVttPath;
    private String errorMsg;
    private long createdAt;
    private Long startedAt;
    private Long finishedAt;
}
