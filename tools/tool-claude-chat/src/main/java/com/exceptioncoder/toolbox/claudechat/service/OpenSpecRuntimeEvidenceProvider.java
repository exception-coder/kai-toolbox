package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.RuntimeEvidence;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.TaskState;

import java.nio.file.Path;
import java.util.Map;

/** 为 OpenSpec 未完成任务提供可选、可信的运行时状态证据。 */
public interface OpenSpecRuntimeEvidenceProvider {

    /**
     * 查询指定项目和 change 的任务证据。
     *
     * @param projectDirectory 已校验项目目录
     * @param changeId OpenSpec change 标识
     * @return 以 OpenSpec 任务 ID 为键的可信证据
     */
    Map<String, Evidence> evidence(Path projectDirectory, String changeId);

    /** 单项运行时状态与展示证据。 */
    record Evidence(TaskState state, RuntimeEvidence detail) {
    }
}
