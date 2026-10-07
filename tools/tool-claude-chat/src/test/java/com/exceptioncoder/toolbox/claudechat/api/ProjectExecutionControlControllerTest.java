package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.Path;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class ProjectExecutionControlControllerTest {
    @TempDir Path root;
    @Test void unrelatedSessionsCannotReadOrChangeProjectControls() {
        var sessions = mock(ClaudeChatSessionRepository.class);
        var access = mock(ClaudeChatSessionAccessPolicy.class);
        var controller = new ProjectExecutionControlController(sessions, access);
        assertThatThrownBy(() -> controller.get("other")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.update("other", new ProjectExecutionControlController.Update("/other", 0, false, "关闭")))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(sessions);
    }
    @Test void sameProjectSessionsShareControlsAndStalePanelsCannotOverwriteThem() throws Exception {
        var sessions = mock(ClaudeChatSessionRepository.class);
        var access = mock(ClaudeChatSessionAccessPolicy.class);
        var session = mock(ClaudeChatSession.class);
        when(session.getCwd()).thenReturn(root.toString());
        when(sessions.findById(anyString())).thenReturn(Optional.of(session));
        when(access.canAccessCurrentUser(anyString())).thenReturn(true);
        var controller = new ProjectExecutionControlController(sessions, access);
        var initial = controller.get("first");
        var changed = controller.update("first", new ProjectExecutionControlController.Update(initial.project(), 0, false, "恢复开发"));
        assertThat(controller.get("second")).isEqualTo(changed);
        var cadence = controller.update("second", new ProjectExecutionControlController.Update(initial.project(), 1, false,
                "逐任务验证", com.exceptioncoder.toolbox.claudechat.service.governance.VerificationCadence.PER_TASK));
        assertThat(controller.get("first")).isEqualTo(cadence);
        assertThat(cadence.enabled()).isFalse();
        assertThat(cadence.verificationCadence()).isEqualTo(com.exceptioncoder.toolbox.claudechat.service.governance.VerificationCadence.PER_TASK);
        assertThatThrownBy(() -> controller.update("second", new ProjectExecutionControlController.Update(initial.project(), 0, true, "过期")))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.update("first", new ProjectExecutionControlController.Update("other-project", 1, true, "错误目标")))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.update("first", new ProjectExecutionControlController.Update(initial.project(), 1, null, "缺参数")))
                .isInstanceOf(ResponseStatusException.class);
    }
}
