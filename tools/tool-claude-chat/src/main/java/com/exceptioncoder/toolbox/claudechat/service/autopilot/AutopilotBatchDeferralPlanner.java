package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository.Batch;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository.DeferredChange;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** 在一个批次内暂留待确认规格，寻找仍可独立执行的下一规格。 */
public final class AutopilotBatchDeferralPlanner {

    private static final TypeReference<List<String>> IDS = new TypeReference<>() { };
    private static final TypeReference<Map<String, String>> REVISIONS = new TypeReference<>() { };

    private final OpenSpecAutopilotAdapter openSpec;
    private final ObjectMapper mapper;

    public AutopilotBatchDeferralPlanner(OpenSpecAutopilotAdapter openSpec, ObjectMapper mapper) {
        this.openSpec = openSpec;
        this.mapper = mapper;
    }

    public Optional<Plan> plan(SessionAutopilotRun run, Batch batch, List<DeferredChange> previous,
                               String blocker) {
        return plan(run, batch, previous, blocker, false);
    }

    /** Only the runner's successful local validation may enter this path. */
    public Optional<Plan> afterManualHandoff(SessionAutopilotRun run, Batch batch,
                                            List<DeferredChange> previous, String blocker) {
        return plan(run, batch, previous, blocker, true);
    }

    private Optional<Plan> plan(SessionAutopilotRun run, Batch batch, List<DeferredChange> previous,
                                String blocker, boolean manualHandoff) {
        if (run.context().phase() != (manualHandoff
                ? OpenSpecExecutionPhase.STRICT_VALIDATE : OpenSpecExecutionPhase.APPLY)) return Optional.empty();
        List<String> order = readIds(batch.changeIdsJson());
        int index = batch.currentIndex();
        if (index >= order.size() - 1 || !order.get(index).equals(run.context().changeId())) {
            return Optional.empty();
        }
        Map<String, String> expected = readRevisions(batch.expectedRevisionsJson());
        Set<String> deferred = new HashSet<>();
        previous.forEach(item -> deferred.add(item.changeId()));
        List<String> ready = new ArrayList<>();
        List<DeferredChange> unavailable = new ArrayList<>();
        ChangeSnapshot selected = null;
        for (int candidate = index + 1; candidate < order.size(); candidate++) {
            String id = order.get(candidate);
            if (deferred.contains(id) && !manualHandoff) continue;
            try {
                ChangeSnapshot snapshot = openSpec.inspect(Path.of(run.context().projectRoot()), id);
                // A completed prerequisite permits fresh preflight of old deferred items.
                // This schedules reassessment, not permission to ignore their previous blockers.
                if ((!manualHandoff && !snapshot.revision().equals(expected.get(id))) || snapshot.nextTask() == null) {
                    unavailable.add(new DeferredChange(id, "规格已变化或没有待执行 task，等待重新预检"));
                    continue;
                }
                var validation = openSpec.strictValidate(Path.of(run.context().projectRoot()), id);
                if (!validation.passed()) {
                    unavailable.add(new DeferredChange(id, "规格校验未通过：" + validation.detail()));
                    continue;
                }
                if (selected == null) selected = snapshot;
                ready.add(id);
            } catch (RuntimeException exception) {
                unavailable.add(new DeferredChange(id, "规格读取失败：" + exception.getMessage()));
            }
        }
        if (selected == null) return Optional.empty();

        List<String> reordered = new ArrayList<>(order.subList(0, index));
        reordered.addAll(ready);
        for (int candidate = index + 1; candidate < order.size(); candidate++) {
            String id = order.get(candidate);
            if (!ready.contains(id)) reordered.add(id);
        }
        reordered.add(order.get(index));
        var task = selected.nextTask();
        OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                run.context().projectRoot(), run.context().repositoryIdentity(),
                run.context().branchAtStart(), run.context().workspaceFingerprint(),
                selected.changeId(), selected.revision(), task.id(), task.applyOrdinal(),
                OpenSpecExecutionPhase.APPLY, run.context().agentSessionRef(),
                run.context().generation() + 1, run.context().version() + 1);
        List<DeferredChange> recorded = new ArrayList<>(unavailable);
        recorded.add(new DeferredChange(run.context().changeId(), blocker));
        try {
            return Optional.of(new Plan(mapper.writeValueAsString(reordered), selected, context, recorded));
        } catch (Exception exception) {
            throw new IllegalStateException("自动监督批次顺序无法保存", exception);
        }
    }

    private List<String> readIds(String json) {
        try {
            return mapper.readValue(json, IDS);
        } catch (Exception exception) {
            throw new IllegalStateException("自动监督批次规格无法读取", exception);
        }
    }

    private Map<String, String> readRevisions(String json) {
        try {
            return mapper.readValue(json, REVISIONS);
        } catch (Exception exception) {
            throw new IllegalStateException("自动监督批次修订无法读取", exception);
        }
    }

    public record Plan(String reorderedChangeIdsJson, ChangeSnapshot nextSnapshot,
                       OpenSpecExecutionContext context, List<DeferredChange> deferred) { }
}
