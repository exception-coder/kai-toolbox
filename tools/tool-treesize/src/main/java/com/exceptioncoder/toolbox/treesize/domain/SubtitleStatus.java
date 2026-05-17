package com.exceptioncoder.toolbox.treesize.domain;

public enum SubtitleStatus {
    PENDING,
    /** 跑 whisper 之前用 ffmpeg 采样判定音频是否有可识别语音，避免无效占用 GPU。 */
    ANALYZING_AUDIO,
    EXTRACTING_AUDIO,
    TRANSCRIBING,
    /** 转写完毕,正在跑 DeepLX/Ollama 翻译。hasVtt 此时已为 true,原字幕可用,UI 只显示翻译进度。 */
    TRANSLATING,
    COMPLETED,
    FAILED,
    CANCELLED
}
