package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * 一次「项目初始化流水线」(yoooni-onboard-pipeline) 的进度视图，镜像状态文件
 * {@code ~/.kai-toolbox/onboard-<系统>.json}。后端只读不写——真正的推进由 skill 在 Vibe Coding
 * 会话里调 {@code pipeline.mjs plan/mark} 完成，这里只把六阶段进度展示出来。
 *
 * @param system    系统名
 * @param separated 是否前后端分离（plan 探测得出）
 * @param createdAt 首次 plan 的 ISO 时间（用于列表排序）
 * @param repos     各仓库探测结果
 * @param stages    六阶段进度（固定 fetch/profile/knowledge/coding/aggregate/topology 顺序）
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record OnboardView(
        String system,
        boolean separated,
        String createdAt,
        List<OnboardRepo> repos,
        List<OnboardStage> stages
) {

    /** 单个仓库探测线索。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OnboardRepo(
            String path,
            boolean exists,
            String role,
            List<String> stack,
            String encoding
    ) {
    }

    /** 单阶段进度。status：done/pending/skipped；at：完成时间（可空）。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OnboardStage(
            String id,
            String name,
            String auto,
            String gate,
            String status,
            String at
    ) {
    }
}
