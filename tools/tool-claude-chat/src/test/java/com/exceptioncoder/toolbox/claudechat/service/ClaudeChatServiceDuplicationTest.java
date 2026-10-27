package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.AuthSessionLinkRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ClaudeChatServiceDuplicationTest {
    private final ClaudeChatSessionRepository repo = mock(ClaudeChatSessionRepository.class);
    private final AuthSessionLinkRepository links = mock(AuthSessionLinkRepository.class);
    private final SidecarClient sidecar = mock(SidecarClient.class);
    private final SessionProjectDirectoryService directories = mock(SessionProjectDirectoryService.class);
    private final EngineCatalogService engines = mock(EngineCatalogService.class);
    private final ClaudeChatSessionAccessPolicy access = mock(ClaudeChatSessionAccessPolicy.class);
    private final WebSocketSession ws = mock(WebSocketSession.class);
    private final ClaudeChatService service = new ClaudeChatService(
            new ClaudeChatProperties(), repo, links, mock(SidecarProcessRegistry.class), sidecar,
            null, null, null, null, null, null, null, null, null, null, null,
            directories, null, null, null, engines, access, null, null, new ObjectMapper(), null,
            List.of(), List.of(), null, mock(SessionVoiceService.class), null, null);

    @BeforeEach
    void prepare() {
        when(ws.getId()).thenReturn("viewer");
        when(ws.getUri()).thenReturn(URI.create("ws://localhost/api/claude-chat/ws"));
        when(access.canAccess(ws, "source")).thenReturn(true);
        when(access.ownerId(ws)).thenReturn(1L);
        when(engines.selectable(anyString())).thenReturn(true);
        when(links.bind(anyString(), anyString(), anyString(), anyLong())).thenReturn(true);
    }

    @Test
    void viewingAndReattachingSessionDoesNotRecordNewActivityOrPinIt() {
        org.springframework.test.util.ReflectionTestUtils.setField(service, "runtimeStates", mock(SessionRuntimeStateService.class));
        var source = source("codex", null);
        source.setLastSeenAt(123L);
        when(repo.findById("source")).thenReturn(Optional.of(source));
        when(sidecar.isConnected()).thenReturn(true);
        service.switchSession(ws, new ClientMessage.SwitchSession("source"));
        service.switchSession(ws, new ClientMessage.SwitchSession("source"));
        service.attach(ws, new ClientMessage.Attach("source", 0));
        verify(repo, org.mockito.Mockito.atLeastOnce()).updateStatus("source", SessionStatus.IDLE);
        verify(repo, never()).touch(eq("source"), any(), anyLong());
        verify(repo, never()).updateFavorite(anyString(), org.mockito.ArgumentMatchers.anyBoolean());
        assertThat(source.getLastSeenAt()).isEqualTo(123L);
    }

    @Test
    void anotherViewerDoesNotReplaceARunningConsultationAccountOrResumeItsThread() {
        org.springframework.test.util.ReflectionTestUtils.setField(service, "runtimeStates", mock(SessionRuntimeStateService.class));
        var source = source("codex", "A");
        source.setExecutionPolicy("consult-readonly");
        when(repo.findById("source")).thenReturn(Optional.of(source));
        when(sidecar.isConnected()).thenReturn(true);
        when(ws.getUri()).thenReturn(URI.create("ws://localhost" + SessionExecutionPolicy.CONSULT_WS_PATH));
        service.switchSession(ws, new ClientMessage.SwitchSession("source"));
        @SuppressWarnings("unchecked")
        var contexts = (java.util.Map<String, Object>) org.springframework.test.util.ReflectionTestUtils.getField(service, "sessions");
        Object ctx = contexts.get("source");
        org.springframework.test.util.ReflectionTestUtils.setField(ctx, "status", SessionStatus.RUNNING);
        org.springframework.test.util.ReflectionTestUtils.setField(ctx, "codexHome", "frozen-A");
        org.mockito.Mockito.clearInvocations(sidecar);
        source.setCodexHome("B");
        service.switchSession(ws, new ClientMessage.SwitchSession("source"));
        assertThat(org.springframework.test.util.ReflectionTestUtils.getField(ctx, "codexHome")).isEqualTo("frozen-A");
        assertThat(org.springframework.test.util.ReflectionTestUtils.getField(ctx, "status")).isEqualTo(SessionStatus.RUNNING);
        verify(sidecar, never()).resumeSession(any(), any(), any(), any(), any(), any(), any(), any(),
                org.mockito.ArgumentMatchers.anyBoolean(), any(), any(), any(), any(), any());
    }

    @Test
    void threadCreationDoesNotCommitAnAccountUntilContextInputOrResponseIsAcknowledged() throws Exception {
        org.springframework.test.util.ReflectionTestUtils.setField(service, "runtimeStates", mock(SessionRuntimeStateService.class));
        var runtime = mock(ConsultRuntimeCoordinator.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "consultRuntime", runtime);
        var source = source("codex", "A"); source.setExecutionPolicy("consult-readonly");
        when(repo.findById("source")).thenReturn(Optional.of(source));
        when(sidecar.isConnected()).thenReturn(true);
        when(ws.getUri()).thenReturn(URI.create("ws://localhost" + SessionExecutionPolicy.CONSULT_WS_PATH));
        service.switchSession(ws, new ClientMessage.SwitchSession("source"));
        @SuppressWarnings("unchecked")
        var contexts = (java.util.Map<String, Object>) org.springframework.test.util.ReflectionTestUtils.getField(service, "sessions");
        Object ctx = contexts.get("source");
        var plan = new ConsultRuntimeCoordinator.Plan(new com.exceptioncoder.toolbox.llm.spi.ConsultationRuntimePolicy.Selection(
                "consult", "B", "new-model", 2, "scope"), "segment-B", true, "context");
        org.springframework.test.util.ReflectionTestUtils.setField(ctx, "consultAccountPlan", plan);
        org.springframework.test.util.ReflectionTestUtils.setField(ctx, "consultAccountCommitted", false);
        org.springframework.test.util.ReflectionTestUtils.setField(ctx, "status", SessionStatus.RUNNING);
        Object lifecycle = org.springframework.test.util.ReflectionTestUtils.getField(service, "turnLifecycle");
        String turn = org.springframework.test.util.ReflectionTestUtils.invokeMethod(lifecycle, "begin", "source");
        var mapper = new ObjectMapper();
        service.onSidecarEvent("source", mapper.readTree("{\"type\":\"init\",\"consultSegmentId\":\"segment-B\",\"sdkSessionId\":\"native-B\"}"));
        verify(repo, never()).updateConsultAccount(any(), any(), any(), any(), any(), any(), any());
        service.onSidecarEvent("source", mapper.readTree("{\"type\":\"init\",\"consultSegmentId\":\"segment-A\",\"sdkSessionId\":\"late-A\"}"));
        assertThat(org.springframework.test.util.ReflectionTestUtils.getField(ctx, "sdkSessionId")).isEqualTo("native-B");
        service.onSidecarEvent("source", mapper.readTree("{\"type\":\"assistantDelta\",\"turnId\":\"" + turn + "\",\"text\":\"按修正规则继续\"}"));
        verify(repo).updateConsultAccount(eq("source"), eq("B"), eq("new-model"), eq("native-B"), anyString(),
                org.mockito.ArgumentMatchers.isNull(), eq("default"));
    }

    @Test
    void sameAuthCopyCreatesAnIndependentSessionAndLineageWhilePreservingConfiguration() {
        ClaudeChatSession source = source("codex", "C:/Users/test/.codex-pro");
        when(repo.findById("source")).thenReturn(Optional.of(source));

        service.duplicateSession(ws, new ClientMessage.DuplicateSession("source", null, false));

        ArgumentCaptor<ClaudeChatSession> inserted = ArgumentCaptor.forClass(ClaudeChatSession.class);
        verify(repo).insert(inserted.capture());
        ClaudeChatSession copy = inserted.getValue();
        assertThat(copy.getId()).isNotEqualTo(source.getId());
        assertThat(copy.getCodexHome()).isEqualTo(source.getCodexHome());
        assertThat(copy.getCwd()).isEqualTo(source.getCwd());
        assertThat(copy.getSelectedModel()).isEqualTo(source.getSelectedModel());
        assertThat(copy.getSdkSessionId()).isNull();
        verify(links).bind(eq(copy.getId()), eq(copy.getId()), anyString(), anyLong());
        verify(links, never()).ensureLineage(anyString(), anyString(), anyLong());
        verify(repo).updateGroup(copy.getId(), "研发", "任务");
        verify(directories).copy("source", copy.getId());
        verify(repo, never()).deleteById(anyString());
        assertThat(source.getSdkSessionId()).isEqualTo("native-source");
    }

    @Test
    void nonCodexCopyAlsoHasItsOwnLineage() {
        when(repo.findById("source")).thenReturn(Optional.of(source("claude", null)));

        service.duplicateSession(ws, new ClientMessage.DuplicateSession("source", null, false));

        ArgumentCaptor<ClaudeChatSession> inserted = ArgumentCaptor.forClass(ClaudeChatSession.class);
        verify(repo).insert(inserted.capture());
        String id = inserted.getValue().getId();
        verify(links).bind(eq(id), eq(id), eq("__default__"), anyLong());
        verify(links, never()).ensureLineage(anyString(), anyString(), anyLong());
    }

    @Test
    void authHandoffKeepsLookingUpTheExistingTargetInsteadOfCreatingAnotherCopy() {
        when(repo.findById("source")).thenReturn(Optional.of(source("codex", null)));
        when(links.ensureLineage(eq("source"), anyString(), anyLong())).thenReturn("lineage");
        when(links.findSession(eq("lineage"), anyString())).thenReturn(Optional.of("existing-target"));
        // 目标在读取间被删除时走既有 SESSION_NOT_FOUND 恢复路径，也不能创建额外副本。
        when(repo.findById("existing-target")).thenReturn(Optional.empty());

        service.duplicateSession(ws, new ClientMessage.DuplicateSession("source", "C:/Users/test/.codex-other", true));

        verify(repo).findById("existing-target");
        verify(repo, never()).insert(any());
        verify(directories, never()).copy(anyString(), anyString());
    }

    private static ClaudeChatSession source(String engine, String codexHome) {
        return ClaudeChatSession.builder().id("source").userId(1L).cwd("D:/work/project")
                .title("开发任务").engine(engine).codexHome(codexHome).sdkSessionId("native-source")
                .selectedModel("test-model").groupName("研发").subgroupName("任务")
                .status(SessionStatus.IDLE).build();
    }
}
