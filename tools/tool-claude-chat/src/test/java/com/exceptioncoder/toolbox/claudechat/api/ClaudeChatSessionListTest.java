package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.*;
import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexDesktopSyncService;
import com.exceptioncoder.toolbox.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ClaudeChatSessionListTest {
    private final ClaudeChatSessionRepository repository = mock(ClaudeChatSessionRepository.class);
    private final SessionHistoryService history = mock(SessionHistoryService.class);
    private final SessionPlanStateService plans = mock(SessionPlanStateService.class);
    private final ClaudeChatSessionAccessPolicy access = mock(ClaudeChatSessionAccessPolicy.class);
    private final ClaudeChatSessionController controller = new ClaudeChatSessionController(repository,
            mock(ClaudeChatService.class), history, plans, mock(SessionProjectService.class),
            mock(SessionDeletionService.class), mock(SessionRuntimeStateService.class),
            mock(EngineCatalogService.class), access, mock(CodexDesktopSyncService.class));

    @Test
    void listsNewSessionsWithoutSdkIdentityWithAnImmutableEmptyMissingSet() throws Exception {
        when(repository.findAll()).thenReturn(List.of(session("codex", null), session("claude", null),
                session(null, null), session("codex", " ")));
        when(access.canAccessCurrentUser(any(ClaudeChatSession.class))).thenReturn(true);
        when(history.findMissingTranscriptsByLocation(any())).thenReturn(Set.of());
        when(plans.listStates(any())).thenReturn(Map.of());
        var mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(get("/api/claude-chat/sessions")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].transcriptMissing").value(false))
                .andExpect(jsonPath("$[1].transcriptMissing").value(false))
                .andExpect(jsonPath("$[2].transcriptMissing").value(false))
                .andExpect(jsonPath("$[3].transcriptMissing").value(false));
    }

    @Test
    void marksOnlyKnownMissingTranscriptsAndStillFiltersInaccessibleSessions() throws Exception {
        var forbidden = session("codex", "forbidden");
        when(repository.findAll()).thenReturn(List.of(session("codex", " missing "),
                session("claude", "present"), session("pi", "missing"), forbidden));
        when(access.canAccessCurrentUser(any(ClaudeChatSession.class))).thenReturn(true);
        when(access.canAccessCurrentUser(forbidden)).thenReturn(false);
        when(history.findMissingTranscriptsByLocation(any())).thenReturn(Set.of("missing"));
        when(plans.listStates(any())).thenReturn(Map.of());
        var mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(get("/api/claude-chat/sessions")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].transcriptMissing").value(true))
                .andExpect(jsonPath("$[1].transcriptMissing").value(false))
                .andExpect(jsonPath("$[2].transcriptMissing").value(false));
    }

    private ClaudeChatSession session(String engine, String sdkId) {
        return ClaudeChatSession.builder().id(java.util.UUID.randomUUID().toString())
                .engine(engine).sdkSessionId(sdkId).build();
    }
}
