package com.exceptioncoder.toolbox.knowledgegraph.api.dto;

import java.util.List;

/**
 * 供前端 3D 力导图渲染的 Graphify 图数据（来自项目 graphify-out/graph.json）。
 * 原图常有上万节点，直接渲染会卡死浏览器，故后端按节点度数取 Top-N 子图返回。
 *
 * @param total     原图节点总数
 * @param shown     实际返回（渲染）的节点数
 * @param truncated 是否被截断（total &gt; shown）
 * @param nodes     节点：id 唯一、label 展示、group 用于着色（file_type）、community 社区号/名
 * @param links     边：source/target 为节点 id
 */
public record GraphifyGraphView(int total, int shown, boolean truncated, List<Node> nodes, List<Link> links) {

    public record Node(String id, String label, String group, Integer community, String communityName) {
    }

    public record Link(String source, String target, String relation) {
    }
}
