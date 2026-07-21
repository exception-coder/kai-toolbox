package com.exceptioncoder.toolbox.foreconsult.api.dto;

import java.util.List;

/**
 * 系统链路分析结果。
 *
 * @param links 系统间关系边（两端都在请求的系统集合内）
 */
public record TopologyView(
        List<LinkEdge> links
) {

    /**
     * 一条系统间关系。
     *
     * @param from        起点系统名
     * @param to          终点系统名
     * @param relation    关系类型（如 调用 / 数据流 / 依赖 / 上下游，自然语言短标签）
     * @param description 关系说明（可为空）
     */
    public record LinkEdge(
            String from,
            String to,
            String relation,
            String description
    ) {
    }
}
