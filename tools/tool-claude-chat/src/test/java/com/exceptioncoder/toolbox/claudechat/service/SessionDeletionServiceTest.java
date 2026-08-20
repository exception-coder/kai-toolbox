package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;

class SessionDeletionServiceTest {

    @Test
    void closesRuntimeBeforeDeletingSessionMetadata() {
        ClaudeChatService chat = mock(ClaudeChatService.class);
        SessionSiteService sites = mock(SessionSiteService.class);
        SessionProjectDirectoryService directories = mock(SessionProjectDirectoryService.class);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        SessionDeletionService service = new SessionDeletionService(chat, sites, directories, sessions);

        service.delete("review-session-1");

        InOrder ordered = inOrder(chat, sites, directories, sessions);
        ordered.verify(chat).dropSession("review-session-1");
        ordered.verify(sites).clear("review-session-1");
        ordered.verify(directories).clear("review-session-1");
        ordered.verify(sessions).deleteById("review-session-1");
    }
}
