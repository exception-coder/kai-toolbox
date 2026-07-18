package com.exceptioncoder.toolbox.knowledgegraph.model;

import java.time.Instant;

/**
 * 项目工作台跨项目筛选用的状态快照：两类图谱各一个状态，按较差者合并 domain-knowledge/cross-topology。
 *
 * @param graphifyState        Graphify 单项目状态；检测异常时为 null
 * @param businessGraphState   domain-knowledge 与 cross-topology 中较差者；两者都检测失败时为 null
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
