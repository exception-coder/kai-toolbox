package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** 从当前规格快照投影明确的验证组；不根据相邻编号猜测任务关联。 */
public final class AutopilotTaskBatch {
    private static final Pattern GROUP = Pattern.compile("^\\[VERIFY_GROUP:([a-zA-Z0-9_-]{1,64})]\\s+");
    private static final int MAX_TASKS = 6;

    private AutopilotTaskBatch() {
    }

    public static List<TaskSnapshot> select(OpenSpecExecutionContext context, ChangeSnapshot snapshot) {
        if (context.phase() != OpenSpecExecutionPhase.APPLY
                || !context.changeId().equals(snapshot.changeId())
                || !context.changeRevision().equals(snapshot.revision())
                || snapshot.nextTask() == null
                || !snapshot.nextTask().id().equals(context.currentTaskId())
                || !Integer.valueOf(snapshot.nextTask().applyOrdinal()).equals(context.currentTaskOrdinal())) {
            return List.of();
        }
        int start = snapshot.tasks().indexOf(snapshot.nextTask());
        if (start < 0 || snapshot.nextTask().manualHandoff()) {
            return List.of();
        }
        String group = group(snapshot.nextTask());
        if (group.isEmpty()) {
            return List.of(snapshot.nextTask());
        }
        List<TaskSnapshot> batch = new ArrayList<>();
        for (int i = start; i < snapshot.tasks().size() && batch.size() < MAX_TASKS; i++) {
            TaskSnapshot task = snapshot.tasks().get(i);
            if (task.manualHandoff() || !group.equals(group(task))) {
                break;
            }
            if (!task.done()) {
                batch.add(task);
            }
        }
        return List.copyOf(batch);
    }

    private static String group(TaskSnapshot task) {
        if (task.description().contains("[MANUAL_PRODUCTION]")
                || task.description().contains("[MANUAL_CONFIRMATION]")) {
            return "";
        }
        var matcher = GROUP.matcher(task.description());
        return matcher.find() ? matcher.group(1) : "";
    }
}
