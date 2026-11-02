package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SidecarClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CodexDictationControllerTest {
    private final ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
    private final ClaudeChatSessionAccessPolicy access = mock(ClaudeChatSessionAccessPolicy.class);
    private final SidecarClient sidecar = mock(SidecarClient.class);
    private final CodexDictationController controller = new CodexDictationController(sessions, access, sidecar);
    private final ObjectMapper mapper = new ObjectMapper();

    private void allow(String engine) {
        when(access.canAccessCurrentUser("session")).thenReturn(true);
        when(sessions.findById("session")).thenReturn(Optional.of(ClaudeChatSession.builder()
                .id("session").engine(engine).codexHome("selected-home").build()));
    }

    @Test
    void rejectsUnauthorizedBeforeReadingAudioOrAccount() {
        assertThrows(ResponseStatusException.class, () -> controller.available("other"));
        assertThrows(ResponseStatusException.class,
                () -> controller.transcribe("other", new ByteArrayInputStream(new byte[2])));
        verifyNoInteractions(sidecar, sessions);
    }

    @Test
    void usesOnlyServerSelectedHomeAndReturnsFinalText() throws Exception {
        allow("codex");
        when(sidecar.codexDictation(eq("selected-home"), any(byte[].class)))
                .thenReturn(Optional.of(mapper.readTree("{\"text\":\"听写内容\"}")));
        assertEquals("听写内容", controller.transcribe("session", new ByteArrayInputStream(new byte[4])).get("text"));
        verify(sidecar).codexDictation(eq("selected-home"), eq(new byte[4]));
    }

    @Test
    void rejectsUnsupportedEngineEmptyOddAndOversizedPcm() {
        allow("claude");
        assertThrows(ResponseStatusException.class, () -> controller.available("session"));
        allow("codex");
        for (int size : new int[]{0, 1, 16000 * 2 * 120 + 2}) {
            assertThrows(ResponseStatusException.class,
                    () -> controller.transcribe("session", new ByteArrayInputStream(new byte[size])));
        }
        verifyNoInteractions(sidecar);
    }

    @Test
    void keepsFailureExplicitAndReturnsNoCredentialsFromAvailability() throws Exception {
        allow("codex");
        when(sidecar.codexDictation("selected-home", null)).thenReturn(Optional.of(
                mapper.readTree("{\"available\":false,\"error\":\"请检查当前账号\",\"authToken\":\"must-not-leak\"}")));
        var available = controller.available("session");
        assertEquals(false, available.get("available"));
        assertFalse(available.toString().contains("must-not-leak"));
        when(sidecar.codexDictation(eq("selected-home"), any(byte[].class)))
                .thenReturn(Optional.of(mapper.readTree("{\"error\":\"听写失败\"}")));
        assertThrows(ResponseStatusException.class,
                () -> controller.transcribe("session", new ByteArrayInputStream(new byte[2])));
    }
}
