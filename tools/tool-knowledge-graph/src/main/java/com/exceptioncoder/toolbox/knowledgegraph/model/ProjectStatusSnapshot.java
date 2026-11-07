package com.exceptioncoder.toolbox.knowledgegraph.model;

import java.time.Instant;

/**
 * 项目工作台状态快照，兼容已存的公共知识图谱历史状态。
 *
 * @param graphifyState        Graphify 单项目状态；检测异常时为 null
 * @param businessGraphState   旧公共图谱的历史状态；新检测返回 null
 * @param businessGraphError   business 图谱检测异常的原因文案（供 UI 提示），正常为 null
 */
public record ProjectStatusSnapshot(
        String projectPath,
        GraphifyGraphState graphifyState,
        RegistrationState businessGraphState,
        String businessGraphError,
        Instant checkedAt
) {
}
