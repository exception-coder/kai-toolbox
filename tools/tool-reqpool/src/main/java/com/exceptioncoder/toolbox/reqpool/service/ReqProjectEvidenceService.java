package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceQuery;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceQueryPort;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.Optional;

/** 为后台判定复用规格探索的项目理解能力，并在能力缺席时显式降级。 */
@Slf4j
@Service
public class ReqProjectEvidenceService {

    private final ObjectProvider<ProjectEvidenceQueryPort> providers;

    public ReqProjectEvidenceService(ObjectProvider<ProjectEvidenceQueryPort> providers) {
        this.providers = providers;
    }

    public Optional<String> capture(ReqItem item) {
        return capture(item, "codex");
    }

    public Optional<String> capture(ReqItem item, String engine) {
        ProjectEvidenceQueryPort provider = providers.orderedStream().findFirst().orElse(null);
        if (provider == null) return Optional.empty();
        try {
            String trace = provider.queryTrace(new ProjectEvidenceQuery(
                    item.getTitle(), item.getDescription(), item.getProject(), item.getModule(), engine, null));
            return trace == null || trace.isBlank() ? Optional.empty() : Optional.of(trace);
        } catch (RuntimeException error) {
            log.warn("[reqpool-insight] 项目证据查询失败 itemId={} project={}",
                    item.getId(), item.getProject(), error);
            return Optional.empty();
        }
    }
}
