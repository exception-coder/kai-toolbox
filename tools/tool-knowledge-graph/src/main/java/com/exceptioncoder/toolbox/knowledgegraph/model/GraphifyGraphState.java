package com.exceptioncoder.toolbox.knowledgegraph.model;

/** Graphify 针对单个项目的图谱产出状态（{@code graphify-out/} 是否存在、是否过时）。 */
public enum GraphifyGraphState {
    NOT_GENERATED,
    STALE,
    UP_TO_DATE
}
