package com.exceptioncoder.toolbox.treesize.api.dto;

/**
 * GET /api/treesize/videos/whisper-capability 出参：当前 whisper 后端能干什么。
 *
 * <p>存在的理由是「不可用必须在点击前可见」，从前的后果是用户勾好按钮点下去、跑一趟 HTTP 才吃到 503。
 * 两种模式现已都支持语言识别（cli 走 {@code --detect-language}，asr-service 走 {@code POST /detect}），
 * 但各有各的前置条件：cli 要 binary + 模型文件真实存在，asr-service 要 :9500 服务活着。
 *
 * <p>{@code languageDetectBlockedReason} 非空即「不可用」，其文案与
 * {@code VideoLanguageDetectionService.start()} 的拒绝理由同源，不在前端二次推理。
 * 注意 asr-service 模式下这个字段的计算含一次 2s 超时的 {@code /health} 探测，
 * 调用方应缓存结果，别放在高频轮询路径上。
 *
 * @param mode                        当前后端模式：{@code cli} / {@code asr-service}
 * @param subtitleAvailable           字幕生成的必填配置是否齐（不代表 ASR 服务进程活着）
 * @param languageDetectBlockedReason 语言识别不可用的原因；{@code null} = 可用
 */
public record WhisperCapabilityView(
        String mode,
        boolean subtitleAvailable,
        String languageDetectBlockedReason
) {}
