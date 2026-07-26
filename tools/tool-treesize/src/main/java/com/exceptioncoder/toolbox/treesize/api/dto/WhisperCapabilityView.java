package com.exceptioncoder.toolbox.treesize.api.dto;

/**
 * GET /api/treesize/videos/whisper-capability 出参：当前 whisper 后端能干什么。
 *
 * <p>存在的理由是「能力差异必须在点击前可见」。{@code toolbox.whisper.mode} 是后端手上完全确定的
 * 事实，而两种模式的能力并不等价（{@code asr-service} 的 Python 端只有 /health + /asr，没有单段
 * detect），从前不暴露这条事实的后果是：用户勾好按钮点下去，跑一趟 HTTP 才吃到 503。
 *
 * <p>{@code languageDetectBlockedReason} 非空即「不可用」，其文案与
 * {@code VideoLanguageDetectionService.start()} 的拒绝理由同源，不在前端二次推理。
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
