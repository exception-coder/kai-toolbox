package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionStorageView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.storage.SessionStorageService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SessionStorageControllerTest {
    private final ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
    private final ClaudeChatSessionAccessPolicy access = mock(ClaudeChatSessionAccessPolicy.class);
    private final SessionStorageService storage = mock(SessionStorageService.class);

    @Test
    void authorizesTheBatchBeforeReadingFilesAndReturnsMetadataWithoutPrivatePaths() throws Exception {
        var allowed = ClaudeChatSession.builder().id("allowed").build();
        var denied = ClaudeChatSession.builder().id("denied").build();
        when(sessions.findByIds(List.of("allowed", "denied"))).thenReturn(List.of(allowed, denied));
        when(access.canAccessCurrentUser(allowed)).thenReturn(true);
        when(storage.inspect(List.of(allowed))).thenReturn(List.of(new SessionStorageView(
                "allowed", "available", 1024L, 1, 123L, "本地原生记录", List.of())));
        var mvc = MockMvcBuilders.standaloneSetup(new SessionStorageController(sessions, access, storage)).build();
        mvc.perform(post("/api/claude-chat/sessions/storage").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sessionIds\":[\"allowed\",\"denied\",\"allowed\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].sessionId").value("allowed"))
                .andExpect(jsonPath("$[0].bytes").value(1024))
                .andExpect(jsonPath("$[0].codexHome").doesNotExist())
                .andExpect(jsonPath("$[0].authToken").doesNotExist());
        verify(sessions).findByIds(List.of("allowed", "denied"));
        verify(storage).inspect(List.of(allowed));
    }

    @Test
    void rejectsEmptyAndOversizedRequestsBeforeDatabaseOrFilesystemAccess() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new SessionStorageController(sessions, access, storage)).build();
        String many = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(
                new SessionStorageController.StorageRequest(java.util.Collections.nCopies(101, "id")));
        for (String body : List.of("{}", "{\"sessionIds\":[]}", "{\"sessionIds\":[null]}", many)) {
            mvc.perform(post("/api/claude-chat/sessions/storage").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(sessions, access, storage);
    }
}
