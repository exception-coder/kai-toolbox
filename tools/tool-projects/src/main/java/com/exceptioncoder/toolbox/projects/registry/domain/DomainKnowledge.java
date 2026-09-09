package com.exceptioncoder.toolbox.projects.registry.domain;

import java.util.List;

/** 从代码归纳的领域草稿；引用核验不代表业务含义或运行时事实已经确认。 */
public final class DomainKnowledge {
    private DomainKnowledge() { }

    public record Evidence(String path, int startLine, int endLine, String quote, String nodeId) { }
    public record Mapping(String kind, String value, int evidenceIndex) { }
    public record Draft(String id, String name, String kind, String summary, String confidence,
                        List<String> responsibilities, List<String> flows, List<Evidence> evidence,
                        List<Mapping> mappings, List<String> unknowns, List<String> communities) { }
    public record Result(List<Draft> domains, List<String> gaps) { }
    public record Snapshot(int version, long generatedAt, String sourceFingerprint, String graphFingerprint,
                           String engine, String scope, List<Draft> domains, List<String> gaps) { }
    public record Run(String id, String engine, String scope, String status, String stage,
                      long startedAt, long updatedAt, String error) { }
    public record View(Snapshot snapshot, Run run, boolean stale, String message) { }
}
