package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class DeveloperControlHandoffTest {
    @TempDir Path root;
    @Test void bothCompactAndFullHandoffsRespectTheCurrentDeveloperSetting() {
        var run = mock(SessionAutopilotRun.class);
        when(run.id()).thenReturn("run-1");
        when(run.context()).thenReturn(new OpenSpecExecutionContext(root.toString(), "repo", "main", "fp",
                "change-a", "revision-a", "1.2", 2, OpenSpecExecutionPhase.APPLY, "thread", 1, 0));
        ProjectExecutionControlStore.update(root, 0, false, "developer", "继续开发");
        for (boolean compact : new boolean[] {false, true}) {
            when(run.skillActivated()).thenReturn(compact);
            assertThat(AutopilotTurnHandoff.forRun(run, 1, 3, "继续").instructions())
                    .contains("开发者关闭", "GOVERNANCE_DISABLED", "forge.report_session_progress", "服务重启")
                    .doesNotContain("取得写入许可前不得修改文件");
        }
        ProjectExecutionControlStore.update(root, 1, true, "developer", "恢复门禁");
        when(run.skillActivated()).thenReturn(false);
        assertThat(AutopilotTurnHandoff.forRun(run, 1, 3, "继续").instructions()).contains("取得写入许可前不得修改文件");
    }
}
