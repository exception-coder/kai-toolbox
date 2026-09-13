package com.exceptioncoder.toolbox.projects.registry.domain;

import java.util.List;

/** 跨项目静态关系候选；引用只指向本轮已校验的项目证据。 */
public final class TopologyKnowledge {
    private TopologyKnowledge() { }

    /** 参与项目及本轮独立取证结果。 */
    public record Participant(String projectId, String name, String root, String sourceFingerprint,
                              String graphFingerprint, DomainKnowledge.Result findings) { }

    /** 引用选中项目中的领域和源码证据，从零计数。 */
    public record Citation(String projectId, String domainId, Integer evidenceIndex) { }

    /** 有两端证据的推断关系，尚未验证运行行为。 */
    public record Relation(String id, String fromProjectId, String toProjectId, String kind, String summary,
                           String confidence, List<Citation> evidence, List<String> unknowns) { }

    /** 模型输出只包含关系引用和未覆盖范围。 */
    public record Result(List<Relation> relations, List<String> gaps) { }

    /** 锚点项目持有的一份独立拓扑快照。 */
    public record Snapshot(Integer version, Long generatedAt, String engine, String scope,
                           List<Participant> participants, List<Relation> relations, List<String> gaps) { }

    /** 运行状态与已发布证据的新鲜度分别表达。 */
    public record View(Snapshot snapshot, DomainKnowledge.Run run, Boolean stale, String message) { }
}
