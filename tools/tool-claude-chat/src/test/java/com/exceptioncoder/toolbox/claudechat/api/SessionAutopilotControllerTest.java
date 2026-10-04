package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.service.AutopilotBindingPreviewService;
import com.exceptioncoder.toolbox.claudechat.service.AutopilotProgressConflictException;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionAutopilotService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SessionAutopilotControllerTest {
    @Test
    void progressConflictReturnsVersionedResumeEntry() {
        SessionAutopilotService service = mock(SessionAutopilotService.class);
        when(service.reportProgress(eq("session-1"), any()))
                .thenThrow(new AutopilotProgressConflictException(AutopilotState.WAITING_USER, 36));
        SessionAutopilotController controller = new SessionAutopilotController(service,
                mock(ClaudeChatSessionAccessPolicy.class), mock(AutopilotBindingPreviewService.class));

        assertThatThrownBy(() -> controller.reportProgress("session-1",
                new SessionAutopilotController.ProgressRequest("CONTINUE", "summary", "next",
                        List.of("database verification"), List.of(), null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> {
                    assertThat(error.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(error.getReason()).contains("actions/resume", "expectedVersion\":36");
                });
    }
}
