package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.Run;
import com.exceptioncoder.toolbox.projects.registry.domain.TopologyKnowledge.Snapshot;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/** 跨项目结果独立保存，领域快照不受拓扑探索影响。 */
@Component
public class TopologySnapshotStore extends ProjectKnowledgeStore {
    public TopologySnapshotStore(ObjectMapper json) { super(json, "topology"); }
    public Snapshot snapshot(String root) { return read(root, "snapshot.json", Snapshot.class); }
    public Run run(String root) { return read(root, "run.json", Run.class); }
    public void saveSnapshot(String root, Snapshot snapshot) { write(root, "snapshot.json", snapshot); }
    public void saveRun(String root, Run run) { write(root, "run.json", run); }
}
