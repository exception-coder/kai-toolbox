package com.exceptioncoder.toolbox.treesize.domain;

public enum SubtitleStatus {
    PENDING,
    /** 跑 whisper 之前用 ffmpeg 采样判定音频是否有可识别语音，避免无效占用 GPU。 */
    ANALYZING_AUDIO,
    EXTRACTING_AUDIO,
    TRANSCRIBING,
    COMPLETED,
    FAILED,
    CANCELLED
}
