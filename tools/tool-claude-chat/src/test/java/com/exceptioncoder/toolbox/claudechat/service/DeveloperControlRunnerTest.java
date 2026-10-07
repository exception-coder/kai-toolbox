package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.*;
import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class DeveloperControlRunnerTest {
    @TempDir Path root;
    @Test void disabledGatesContinueActualTasksAndEndWithUnverifiedHandoffWithoutArchiving() {
        var openSpec = mock(OpenSpecAutopilotAdapter.class);
        var quality = mock(ForgeQualityGateAdapter.class);
        var runner = new OpenSpecContinuousRunner(openSpec, quality);
        var run = mock(SessionAutopilotRun.class);
        when(run.context()).thenReturn(new OpenSpecExecutionContext(root.toString(), "repo", "main", "fp",
                "change-a", "revision-a", "1.2", 2, OpenSpecExecutionPhase.QUALITY_GATE, "thread", 1, 0));
        ProjectExecutionControlStore.update(root, 0, false, "developer", "恢复开发");
        var task = new OpenSpecAutopilotAdapter.TaskSnapshot("1.2", 2, "pending", false);
        var pending = new OpenSpecAutopilotAdapter.ChangeSnapshot("change-a", "rev", 0, 1, List.of(task), Map.of(), task);
        var continuation = runner.decide(run, pending);
        assertThat(continuation.context().phase()).isEqualTo(OpenSpecExecutionPhase.APPLY);
        assertThat(continuation.state()).isEqualTo(AutopilotState.ACTIVE);
        when(run.noProgressCount()).thenReturn(3);
        var repeated = runner.decide(run, pending);
        assertThat(repeated.noProgressCount()).isEqualTo(4);
        assertThat(repeated.state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(repeated.reason()).contains("核对已有成果");
        var next = new OpenSpecAutopilotAdapter.TaskSnapshot("1.3", 3, "next", false);
        var moved = runner.decide(run, new OpenSpecAutopilotAdapter.ChangeSnapshot("change-a", "rev2", 1, 2,
                List.of(next), Map.of(), next));
        assertThat(moved.noProgressCount()).isZero();
        var done = new OpenSpecAutopilotAdapter.ChangeSnapshot("change-a", "rev", 1, 1, List.of(), Map.of(), null);
        var handoff = runner.decide(run, done);
        assertThat(handoff.state()).isEqualTo(AutopilotState.STOPPED);
        assertThat(handoff.code()).isEqualTo("DEVELOPER_HANDOFF");
        assertThat(handoff.reason()).contains("未执行", "验收");
        verifyNoInteractions(openSpec, quality);
    }
}
