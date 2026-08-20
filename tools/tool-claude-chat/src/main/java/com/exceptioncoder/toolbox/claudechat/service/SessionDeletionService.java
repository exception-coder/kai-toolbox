package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 统一收口运行态并删除会话及其工作台附属关系。 */
@Service
public class SessionDeletionService {
    private final ClaudeChatService chatService;
    private final SessionSiteService sessionSiteService;
    private final SessionProjectDirectoryService projectDirectoryService;
    private final ClaudeChatSessionRepository sessionRepository;

    public SessionDeletionService(ClaudeChatService chatService,
                                  SessionSiteService sessionSiteService,
                                  SessionProjectDirectoryService projectDirectoryService,
                                  ClaudeChatSessionRepository sessionRepository) {
        this.chatService = chatService;
        this.sessionSiteService = sessionSiteService;
        this.projectDirectoryService = projectDirectoryService;
        this.sessionRepository = sessionRepository;
    }

    @Transactional
    public void delete(String sessionId) {
        chatService.dropSession(sessionId);
        sessionSiteService.clear(sessionId);
        projectDirectoryService.clear(sessionId);
        sessionRepository.deleteById(sessionId);
    }
}
