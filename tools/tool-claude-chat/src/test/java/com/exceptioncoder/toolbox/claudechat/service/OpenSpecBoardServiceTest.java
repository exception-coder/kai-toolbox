package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.AffectedApiEvidence;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.BoardList;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.ChangeDetail;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.ProjectState;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.TaskState;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.RuntimeEvidence;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.Freshness;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse.RootView;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

class OpenSpecBoardServiceTest {

    @TempDir
    Path projectDirectory;

    @Mock
    WorkspaceScanService workspaceScanService;

    @Mock
    OpenSpecCliGateway cliGateway;

    @Mock
    OpenSpecAffectedApiEvidenceService affectedApiEvidenceService;

    private OpenSpecBoardService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        when(workspaceScanService.scan()).thenReturn(workspace());
        when(affectedApiEvidenceService.evidence(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString())).thenReturn(List.of());
        service = new OpenSpecBoardService(workspaceScanService, cliGateway,
                (project, change) -> Map.of(), affectedApiEvidenceService,
                new OpenSpecBoardJsonAdapter(new ObjectMapper()));
    }

    @Test
    void listsReadyProjectAndActiveChanges() {
        when(cliGateway.run(projectDirectory, List.of("context", "--json")))
                .thenReturn(result(0, "{\"root\":{\"path\":\"project\"}}"));
        when(cliGateway.run(projectDirectory, List.of("list", "--json")))
                .thenReturn(result(0, """
                        {"changes":[{"name":"openspec-task-board","completedTasks":3,"totalTasks":5,
                        "lastModified":"2026-09-02T17:02:18.899Z","status":"in-progress"}]}
                        """));

        BoardList boards = service.boards();

        assertThat(boards.projects()).hasSize(1);
        assertThat(boards.projects().getFirst().state()).isEqualTo(ProjectState.READY);
        assertThat(boards.projects().getFirst().changes()).singleElement()
                .satisfies(change -> {
                    assertThat(change.id()).isEqualTo("openspec-task-board");
                    assertThat(change.completedTasks()).isEqualTo(3);
                    assertThat(change.totalTasks()).isEqualTo(5);
                });
    }

    @Test
    void keepsNotInitializedProjectVisible() {
        when(cliGateway.run(projectDirectory, List.of("context", "--json")))
                .thenReturn(result(1, "{\"code\":\"no_openspec_root\"}"));

        BoardList boards = service.boards();

        assertThat(boards.projects().getFirst().state()).isEqualTo(ProjectState.NOT_INITIALIZED);
        assertThat(boards.projects().getFirst().message()).contains("尚未初始化");
    }

    @Test
    void loadsTasksAndKeepsCompletionAuthoritative() {
        when(cliGateway.run(projectDirectory, List.of("context", "--json")))
                .thenReturn(result(0, "{}"));
        when(cliGateway.run(projectDirectory, List.of("list", "--json")))
                .thenReturn(result(0, "{\"changes\":[{\"name\":\"openspec-task-board\"}]}"));
        String root = projectDirectory.toString().replace("\\", "\\\\");
        when(cliGateway.run(projectDirectory,
                List.of("status", "--change", "openspec-task-board", "--json")))
                .thenReturn(result(0, "{\"planningHome\":{\"root\":\"" + root +
                        "\"},\"artifactPaths\":{\"proposal\":{\"existingOutputPaths\":[]}}}"));
        when(cliGateway.run(projectDirectory,
                List.of("instructions", "apply", "--change", "openspec-task-board", "--json")))
                .thenReturn(result(0, """
                        {"progress":{"total":2,"complete":1},"tasks":[
                          {"id":"1","description":"1.1 Build adapter","done":true},
                          {"id":"2","description":"1.2 Build board","done":false}
                        ]}
                        """));
        AffectedApiEvidence affectedApi = new AffectedApiEvidence(
                "session-1", "POST", "/api/orders", "ADDED", "src/OrderController.java",
                "OrderController#create", "创建订单", "UNVERIFIED", null, null, Instant.now());
        when(affectedApiEvidenceService.evidence(projectDirectory, "openspec-task-board"))
                .thenReturn(List.of(affectedApi));

        String projectId = service.boards().projects().getFirst().id();
        ChangeDetail detail = service.change(projectId, "openspec-task-board");

        assertThat(detail.tasks()).extracting(task -> task.state())
                .containsExactly(TaskState.DONE, TaskState.TODO);
        assertThat(detail.tasks().getFirst().outlineId()).isEqualTo("1.1");
        assertThat(detail.tasks().getFirst().description()).isEqualTo("Build adapter");
        assertThat(detail.affectedApis()).containsExactly(affectedApi);
    }

    @Test
    void rejectsUnknownProjectBeforeExecutingChangeCommands() {
        assertThatThrownBy(() -> service.change("unknown", "openspec-task-board"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不在允许范围");
    }

    @Test
    void rejectsUnsafeChangeIdentifier() {
        assertThatThrownBy(() -> service.change("project", "../outside"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("标识不合法");
    }

    @Test
    void isolatesTimedOutProject() {
        when(cliGateway.run(projectDirectory, List.of("context", "--json")))
                .thenReturn(new OpenSpecCliGateway.CommandResult(true, true, -1, "timeout"));

        assertThat(service.boards(true).projects()).singleElement()
                .satisfies(project -> {
                    assertThat(project.state()).isEqualTo(ProjectState.ERROR);
                    assertThat(project.message()).contains("超时");
                });
    }

    @Test
    void isolatesMalformedProjectAndKeepsBoardResponse() {
        when(cliGateway.run(projectDirectory, List.of("context", "--json")))
                .thenReturn(result(0, "{}"));
        when(cliGateway.run(projectDirectory, List.of("list", "--json")))
                .thenReturn(result(0, "{}"));

        BoardList boards = service.boards();

        assertThat(boards.projects()).singleElement()
                .satisfies(project -> {
                    assertThat(project.state()).isEqualTo(ProjectState.ERROR);
                    assertThat(project.message()).contains("changes 数组");
                });
    }

    @Test
    void reusesSnapshotUntilTargetedRefresh() {
        when(cliGateway.run(projectDirectory, List.of("context", "--json")))
                .thenReturn(result(0, "{}"));
        when(cliGateway.run(projectDirectory, List.of("list", "--json")))
                .thenReturn(result(0, "{\"changes\":[]}"));

        service.boards();
        service.boards();
        service.boards(true);

        verify(cliGateway, times(2)).run(projectDirectory, List.of("context", "--json"));
        verify(cliGateway, times(2)).run(projectDirectory, List.of("list", "--json"));
    }

    @Test
    void runtimeEnrichesOnlyIncompleteTasks() {
        RuntimeEvidence runtime = new RuntimeEvidence("session-1", "codex", "VERIFY",
                Instant.now(), "等待验证");
        service = new OpenSpecBoardService(workspaceScanService, cliGateway,
                (project, change) -> Map.of(
                        "1", new OpenSpecRuntimeEvidenceProvider.Evidence(TaskState.BLOCKED, runtime),
                        "2", new OpenSpecRuntimeEvidenceProvider.Evidence(TaskState.IN_REVIEW, runtime)),
                affectedApiEvidenceService,
                new OpenSpecBoardJsonAdapter(new ObjectMapper()));
        when(cliGateway.run(projectDirectory, List.of("context", "--json")))
                .thenReturn(result(0, "{}"));
        when(cliGateway.run(projectDirectory, List.of("list", "--json")))
                .thenReturn(result(0, "{\"changes\":[{\"name\":\"board\"}]}"));
        when(cliGateway.run(projectDirectory, List.of("status", "--change", "board", "--json")))
                .thenReturn(result(0, "{\"planningHome\":{\"root\":\"" +
                        projectDirectory.toString().replace("\\", "\\\\") +
                        "\"},\"artifactPaths\":{}}"));
        when(cliGateway.run(projectDirectory,
                List.of("instructions", "apply", "--change", "board", "--json")))
                .thenReturn(result(0, """
                        {"progress":{"total":2,"complete":1},"tasks":[
                          {"id":"1","description":"1.1 Completed","done":true},
                          {"id":"2","description":"1.2 Review","done":false}
                        ]}
                        """));

        String projectId = service.boards(true).projects().getFirst().id();
        ChangeDetail detail = service.change(projectId, "board", true);

        assertThat(detail.tasks()).extracting(task -> task.state())
                .containsExactly(TaskState.DONE, TaskState.IN_REVIEW);
        assertThat(detail.tasks().getFirst().runtime()).isNull();
        assertThat(detail.tasks().get(1).runtime()).isEqualTo(runtime);
    }

    @Test
    void preservesCachedDetailAsStaleWhenRefreshFails() {
        when(cliGateway.run(projectDirectory, List.of("context", "--json")))
                .thenReturn(result(0, "{}"));
        OpenSpecCliGateway.CommandResult listed = result(0, "{\"changes\":[{\"name\":\"board\"}]}");
        when(cliGateway.run(projectDirectory, List.of("list", "--json")))
                .thenReturn(listed, listed, result(1, "unavailable"));
        when(cliGateway.run(projectDirectory, List.of("status", "--change", "board", "--json")))
                .thenReturn(result(0, "{\"planningHome\":{\"root\":\"\"},\"artifactPaths\":{}}"));
        when(cliGateway.run(projectDirectory,
                List.of("instructions", "apply", "--change", "board", "--json")))
                .thenReturn(result(0, "{\"progress\":{\"total\":0,\"complete\":0},\"tasks\":[]}"));

        String projectId = service.boards(true).projects().getFirst().id();
        ChangeDetail fresh = service.change(projectId, "board", true);
        ChangeDetail stale = service.change(projectId, "board", true);

        assertThat(fresh.freshness()).isEqualTo(Freshness.FRESH);
        assertThat(stale.freshness()).isEqualTo(Freshness.STALE);
        assertThat(stale.snapshotAt()).isEqualTo(fresh.snapshotAt());
    }

    private WorkspaceListResponse workspace() {
        WorkspaceDirView directory = new WorkspaceDirView(
                projectDirectory.getFileName().toString(), projectDirectory.toString(), null, "Test Project");
        return new WorkspaceListResponse(
                List.of(new RootView(projectDirectory.getParent().toString(), true, List.of(directory))),
                OffsetDateTime.now());
    }

    private OpenSpecCliGateway.CommandResult result(int exitCode, String output) {
        return new OpenSpecCliGateway.CommandResult(true, false, exitCode, output);
    }
}
