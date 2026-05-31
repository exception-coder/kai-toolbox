package com.exceptioncoder.toolbox.treesize.domain;

/**
 * whisper-cli {@code --detect-language} 解析结果：ISO 语言码 + 置信度（whisper 输出的 p 值）。
 * <p>由 {@code WhisperRunner.detectLanguage} 解析 stderr 行 {@code auto-detected language: ja (p = 0.987765)} 得到。
 */
public record DetectedLanguage(String iso, double confidence) {}
