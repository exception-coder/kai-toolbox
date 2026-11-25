package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ChatSubmissionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatSubmissionServiceTest {
    @Test
    void persistsBeforeAsyncWorkAndDoesNotNeedViewerToRecordDispatchRejection() throws Exception {
        var service = mock(ClaudeChatService.class, CALLS_REAL_METHODS);
        var records = mock(ChatSubmissionRepository.class);
        var repository = mock(ClaudeChatSessionRepository.class);
        var access = mock(ClaudeChatSessionAccessPolicy.class);
        var gate = mock(AgentWorkAdmissionGate.class);
        var session = ClaudeChatSession.builder().id("owner").cwd("workspace").executionPolicy("standard").build();
        when(repository.findById("owner")).thenReturn(Optional.of(session));
        var message = new ClientMessage.Send("完整原文", null, null, null, "message");
        when(records.accept("owner", message)).thenReturn(true, false);
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(gate.isDraining()).thenAnswer(call -> { entered.countDown(); assertTrue(release.await(5, TimeUnit.SECONDS)); return true; });
        ReflectionTestUtils.setField(service, "repo", repository);
        ReflectionTestUtils.setField(service, "submissions", records);
        ReflectionTestUtils.setField(service, "sessionAccessPolicy", access);
        ReflectionTestUtils.setField(service, "admissionGate", gate);
        ReflectionTestUtils.setField(service, "sessions", new ConcurrentHashMap<>(Map.of("owner", new SessionCtx("owner", "workspace"))));
        ReflectionTestUtils.setField(service, "events", new SessionEventChannel(new ObjectMapper(), () -> 20, ws -> true));
        service.submitUserMessage("owner", message);
        assertTrue(entered.await(5, TimeUnit.SECONDS));
        verify(records).accept("owner", message);
        // 浏览器离开原会话、甚至无任何在线观察者，都不参与已接单任务的执行归属。
        service.submitUserMessage("owner", message);
        release.countDown();
        verify(records, timeout(5000)).failed(eq("owner"), eq("message"), contains("SYSTEM_UPDATING"));
        verify(gate, times(1)).isDraining();
    }
}
