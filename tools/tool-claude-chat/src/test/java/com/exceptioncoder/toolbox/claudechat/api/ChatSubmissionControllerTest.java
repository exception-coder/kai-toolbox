package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.repository.ChatSubmissionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatSubmissionControllerTest {
    @Test
    void deniesReadingAndSubmittingAnotherUsersSessionBeforeAnySideEffects() {
        var records = mock(ChatSubmissionRepository.class);
        var chat = mock(ClaudeChatService.class);
        var access = mock(ClaudeChatSessionAccessPolicy.class);
        var controller = new ChatSubmissionController(records, chat, access);
        var message = new ClientMessage.Send("原文", null, null, null, "message");
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> controller.list("other")).getStatusCode().value());
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> controller.submit("other", message)).getStatusCode().value());
        verifyNoInteractions(records, chat);
        when(access.canInteractCurrentUser("owner")).thenReturn(true);
        controller.submit("owner", message);
        verify(chat).submitUserMessage("owner", message);
    }
}
