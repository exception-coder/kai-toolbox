package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.anyString;

class AutopilotBindingPreviewServiceTest {
    @Test
    void aiRecommendationKeepsOnlyRealCandidateIds(@TempDir Path root) {
        var sessions = mock(ClaudeChatSessionRepository.class);
        var history = mock(SessionHistoryService.class);
        var projects = mock(AutopilotProjectContextResolver.class);
        var catalog = mock(OpenSpecChangeCatalog.class);
        var agent = mock(AgentOneShotService.class);
        when(projects.resolve("session", root.toString())).thenReturn(
                new AutopilotProjectContextResolver.ProjectIdentity(root, "repo", "main", "hash", "agent"));
        when(sessions.findById("session")).thenReturn(Optional.of(ClaudeChatSession.builder()
                .cwd(root.toString()).title("组织权限管理").engine("codex").selectedModel("model").build()));
        when(catalog.recommend(org.mockito.ArgumentMatchers.eq(root), anyString(),
                org.mockito.ArgumentMatchers.eq(30))).thenReturn(List.of(
                new OpenSpecAutopilotAdapter.ChangeOption("implement-iam-access", 1, 10, null)));
        when(agent.runOnce(anyString(), anyString(), org.mockito.ArgumentMatchers.eq("model"),
                org.mockito.ArgumentMatchers.eq("codex")))
                .thenReturn("[\"implement-iam-access\",\"invented-change\"]");
        var service = new AutopilotBindingPreviewService(sessions, history, projects,
                mock(OpenSpecAutopilotAdapter.class), catalog, agent,
                new com.fasterxml.jackson.databind.ObjectMapper());

        assertThat(service.recommendAi("session", root.toString()))
                .containsExactly("implement-iam-access");
    }
    @Test
    void recentSessionContextRanksRelevantChangeAndKeepsInvalidChangeVisible() {
        var sessions = mock(ClaudeChatSessionRepository.class);
        var history = mock(SessionHistoryService.class);
        var projects = mock(AutopilotProjectContextResolver.class);
        var openSpec = mock(OpenSpecAutopilotAdapter.class);
        var catalog = mock(OpenSpecChangeCatalog.class);
        var root = Path.of("D:/repo");
        when(projects.resolve("session", "D:/repo")).thenReturn(
                new AutopilotProjectContextResolver.ProjectIdentity(root, "repo", "main", "hash", "agent"));
        when(sessions.findById("session")).thenReturn(Optional.of(
                ClaudeChatSession.builder().cwd("D:/repo").sdkSessionId("agent").build()));
        when(history.readMessages("D:/repo", "agent", null, null, 30)).thenReturn(
                new MessagePage(List.of(ChatMessageView.user("1", "继续 upload-images 的规划", 1L)), null, false));
        when(catalog.recommend(org.mockito.ArgumentMatchers.eq(root), anyString(), org.mockito.ArgumentMatchers.eq(30))).thenReturn(List.of(
                new OpenSpecAutopilotAdapter.ChangeOption("other", 0, 1, null),
                new OpenSpecAutopilotAdapter.ChangeOption("upload-images", 0, 1, null)));
        when(catalog.find(root, "upload-images")).thenReturn(Optional.of(
                new OpenSpecAutopilotAdapter.ChangeOption("upload-images", 0, 1, null)));
        var task = new OpenSpecAutopilotAdapter.TaskSnapshot("1.1", 1, "upload", false);
        when(openSpec.inspect(root, "upload-images")).thenReturn(
                new OpenSpecAutopilotAdapter.ChangeSnapshot("upload-images", "rev", 0, 1,
                        List.of(task), Map.of(), task));
        when(openSpec.strictValidate(root, "upload-images")).thenReturn(
                new OpenSpecAutopilotAdapter.ValidationResult(true, "ok"));

        var service = new AutopilotBindingPreviewService(sessions, history, projects, openSpec, catalog,
                mock(AgentOneShotService.class), new com.fasterxml.jackson.databind.ObjectMapper());
        var candidates = service.preview("session", "D:/repo");

        assertThat(candidates.getFirst().changeId()).isEqualTo("upload-images");
        assertThat(candidates.getFirst().ready()).isFalse();
        var checked = service.check("session", "D:/repo", "upload-images");
        assertThat(checked.ready()).isTrue();
        assertThat(checked.revision()).isEqualTo("rev");
    }
}
