package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.SidecarSdkUpgradeController;
import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatActivityView;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class SidecarSdkUpgradeServiceTest {
    @TempDir Path root;
    private final SidecarVersionService versions = mock(SidecarVersionService.class);
    private final SidecarProcessRegistry registry = mock(SidecarProcessRegistry.class);
    private final SidecarClient client = mock(SidecarClient.class);
    private final ClaudeChatService chat = mock(ClaudeChatService.class);
    private final SidecarSdkUpgradeService service = new SidecarSdkUpgradeService(
            versions, registry, client, chat, new ClaudeChatProperties(), new ObjectMapper());

    @AfterEach void clearAuth() { AuthContext.clear(); }

    @Test void rejectsAnonymousAndNonAdminBeforeAnyWork() {
        assertThatThrownBy(() -> service.start("codex")).hasMessageContaining("403");
        AuthContext.set(new AuthPrincipal(1, "user", List.of("USER"), List.of(), "test", 0));
        assertThatThrownBy(() -> service.start("codex")).hasMessageContaining("403");
        verifyNoInteractions(versions, registry, client, chat);
        assertThat(SidecarSdkUpgradeController.class.getAnnotation(RequireRole.class).value()).contains("ADMIN");
    }

    @Test void rejectsUnsupportedEngineAndBusySessions() {
        admin();
        assertThatThrownBy(() -> service.start("codex; echo unsafe")).hasMessageContaining("400");
        assertThatThrownBy(() -> service.start("antigravity")).hasMessageContaining("400");
        when(chat.activitySnapshot()).thenReturn(activity(true));
        assertThatThrownBy(() -> service.start("codex")).hasMessageContaining("409");
        verifyNoInteractions(versions, registry, client);
    }

    @Test void preservesConcurrentSourceEdits() throws Exception {
        var workspace = workspace();
        Files.writeString(root.resolve("src/test.ts"), "concurrent user edit");
        assertThatThrownBy(workspace::promote).hasMessageContaining("发生变化");
        assertThat(Files.readString(root.resolve("package.json"))).isEqualTo("old");
        assertThat(Files.readString(root.resolve("src/test.ts"))).isEqualTo("concurrent user edit");
    }

    @Test void rejectsConcurrentUpgradeRequests() throws Exception {
        admin();
        var entered = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        when(chat.activitySnapshot()).thenReturn(activity(false));
        when(versions.read(true)).thenAnswer(invocation -> {
            entered.countDown();
            release.await(5, java.util.concurrent.TimeUnit.SECONDS);
            return com.exceptioncoder.toolbox.claudechat.api.dto.SidecarVersionView.error("test unavailable");
        });
        try {
            assertThat(service.start("codex").running()).isTrue();
            assertThat(entered.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> service.start("claude")).hasMessageContaining("409");
        } finally {
            release.countDown();
        }
        verifyNoInteractions(registry, client);
    }

    @Test void comparesStableVersionsWithoutDowngrading() {
        assertThat(SidecarSdkUpgradeService.compareStableVersions("0.153.4", "0.150.1")).isPositive();
        assertThat(SidecarSdkUpgradeService.compareStableVersions("1.9.0", "1.10.0")).isNegative();
        assertThat(SidecarSdkUpgradeService.compareStableVersions("0.153.4", "0.153.4")).isZero();
    }

    @Test void batchValidationRejectsWholeSelectionBeforeStarting() {
        admin();
        assertThatThrownBy(() -> service.start(List.of())).hasMessageContaining("400");
        assertThatThrownBy(() -> service.start(List.of("codex", "antigravity"))).hasMessageContaining("400");
        verifyNoInteractions(versions, registry, client, chat);
    }

    @Test void batchPlansOneInstallSkipsCurrentAndHigherVersionsAndDeduplicates() throws Exception {
        when(versions.read(true)).thenReturn(versionView(
                version("codex", "1.0.0", "1.1.0"), version("claude", "2.0.0", "2.1.0"),
                version("qwen", "3.0.0", "3.0.0"), version("opencode", "4.1.0-alpha.1", "4.0.0")));
        assertThat(service.dependencies(List.of("codex", "claude", "qwen", "opencode", "codex")))
                .containsExactly("@openai/codex-sdk@1.1.0", "@anthropic-ai/claude-agent-sdk@2.1.0");
        verify(versions).read(true);
    }

    @Test void sameVersionPrereleaseCanAdvanceToStableButBuildMetadataDoesNotReinstall() throws Exception {
        when(versions.read(true)).thenReturn(versionView(
                version("codex", "1.0.0-alpha.1", "1.0.0"), version("claude", "2.0.0+build-beta.1", "2.0.0")));
        assertThat(service.dependencies(List.of("codex", "claude"))).containsExactly("@openai/codex-sdk@1.0.0");
    }

    @Test void failedVersionLookupDoesNotInstallAnyPackage() {
        when(versions.read(true)).thenReturn(versionView(
                version("codex", "1.0.0", "1.1.0"), version("claude", "2.0.0", null)));
        service.upgrade(List.of("codex", "claude"));
        assertThat(service.status().phase()).isEqualTo("FAILED");
        verifyNoInteractions(registry, client);
    }

    @Test void allCurrentSelectionDoesNotReconnect() {
        when(versions.read(true)).thenReturn(versionView(version("codex", "1.0.0", "1.0.0")));
        service.upgrade(List.of("codex"));
        assertThat(service.status().phase()).isEqualTo("SUCCEEDED");
        verifyNoInteractions(registry, client);
    }

    @Test void batchPreparesAndActivatesOnlyOnce() throws Exception {
        workspace();
        when(registry.sidecarDir()).thenReturn(root);
        when(versions.read(true)).thenReturn(versionView(
                version("codex", "1.0.0", "1.1.0"), version("claude", "2.0.0", "2.1.0")));
        var batch = spy(service);
        doNothing().when(batch).prepare(any(), anyList());
        doNothing().when(batch).activate(any());
        batch.upgrade(List.of("codex", "claude"));
        verify(batch).prepare(any(), eq(List.of("@openai/codex-sdk@1.1.0", "@anthropic-ai/claude-agent-sdk@2.1.0")));
        verify(batch).activate(any());
        assertThat(batch.status().phase()).isEqualTo("SUCCEEDED");
    }

    private static com.exceptioncoder.toolbox.claudechat.api.dto.SidecarEngineVersionView version(
            String id, String installed, String latest) {
        return new com.exceptioncoder.toolbox.claudechat.api.dto.SidecarEngineVersionView(
                id, id, SidecarVersionService.upgradePackage(id), installed, installed, null, latest, false, null);
    }

    private static com.exceptioncoder.toolbox.claudechat.api.dto.SidecarVersionView versionView(
            com.exceptioncoder.toolbox.claudechat.api.dto.SidecarEngineVersionView... engines) {
        return new com.exceptioncoder.toolbox.claudechat.api.dto.SidecarVersionView(
                null, null, null, null, false, null, null, List.of(engines));
    }

    @Test void refusesActivationAfterNewWorkArrivesAndReleasesGates() throws Exception {
        var workspace = workspace();
        when(chat.activitySnapshot()).thenReturn(activity(true));
        assertThatThrownBy(() -> service.activate(workspace)).hasMessageContaining("活动会话");
        verify(client).beginSdkMaintenance();
        verify(client).endSdkMaintenance();
        verify(registry, never()).stopForSdkUpgrade();
        assertThat(Files.readString(root.resolve("package.json"))).isEqualTo("old");
    }

    @Test void promotesAndResumesSessionsOnlyAfterConnection() throws Exception {
        var workspace = workspace();
        when(chat.activitySnapshot()).thenReturn(activity(false));
        when(client.isConnected()).thenReturn(true);
        when(chat.resumeAllSessions()).thenReturn(true);
        service.activate(workspace);
        assertThat(Files.readString(root.resolve("package.json"))).isEqualTo("new");
        assertThat(Files.readString(workspace.backup().resolve("package.json"))).isEqualTo("old");
        var order = inOrder(client, registry, chat);
        order.verify(client).beginSdkMaintenance();
        order.verify(registry).beginSdkMaintenance();
        order.verify(chat).activitySnapshot();
        order.verify(client).disconnectForSdkUpgrade();
        order.verify(registry).stopForSdkUpgrade();
        order.verify(client).ensureConnected();
        order.verify(client).endSdkMaintenance();
        order.verify(chat).resumeAllSessions();
    }

    @Test void restoresOldFilesAndSessionsAfterFailedConnection() throws Exception {
        var workspace = workspace();
        when(chat.activitySnapshot()).thenReturn(activity(false));
        when(client.isConnected()).thenReturn(true);
        when(chat.resumeAllSessions()).thenReturn(true);
        doThrow(new IOException("new runtime failed")).doNothing().when(client).ensureConnected();
        assertThatThrownBy(() -> service.activate(workspace)).hasMessageContaining("已恢复原版本");
        assertThat(Files.readString(root.resolve("package.json"))).isEqualTo("old");
        assertThat(Files.readString(root.resolve("node_modules/version"))).isEqualTo("old");
        verify(chat).resumeAllSessions();
        verify(client).endSdkMaintenance();
    }

    @Test void doesNotClaimResumedWhenTheRuntimeSnapshotIsUnknown() throws Exception {
        var workspace = workspace();
        when(chat.activitySnapshot()).thenReturn(activity(false));
        when(client.isConnected()).thenReturn(true);
        when(chat.resumeAllSessions()).thenReturn(false);
        assertThatThrownBy(() -> service.activate(workspace)).hasMessageContaining("部分会话状态尚未确认");
        verify(client).endSdkMaintenance();
        verify(registry, atLeastOnce()).endSdkMaintenance();
    }

    @Test void restoresPartialPromotion() throws Exception {
        var workspace = workspace();
        Files.createDirectory(workspace.backup().resolve("node_modules"));
        assertThatThrownBy(workspace::promote).isInstanceOf(IOException.class);
        workspace.rollback();
        assertThat(Files.readString(root.resolve("package.json"))).isEqualTo("old");
        assertThat(Files.readString(root.resolve("node_modules/version"))).isEqualTo("old");
    }

    private SidecarSdkUpgradeWorkspace workspace() throws Exception {
        for (String name : List.of("package.json", "package-lock.json", "tsconfig.json")) {
            Files.writeString(root.resolve(name), "old");
        }
        for (String name : List.of("src", "scripts", "node_modules", "dist")) {
            Files.createDirectories(root.resolve(name));
        }
        Files.writeString(root.resolve("src/test.ts"), "old source");
        Files.writeString(root.resolve("node_modules/version"), "old");
        var workspace = new SidecarSdkUpgradeWorkspace(root);
        for (String name : List.of("package.json", "package-lock.json")) {
            Files.writeString(workspace.stage().resolve(name), "new");
        }
        Files.createDirectories(workspace.stage().resolve("node_modules"));
        Files.createDirectories(workspace.stage().resolve("dist"));
        Files.writeString(workspace.stage().resolve("node_modules/version"), "new");
        return workspace;
    }

    private static ClaudeChatActivityView activity(boolean active) {
        return new ClaudeChatActivityView(active, !active, active ? 1 : 0, active ? 1 : 0, 0, 0, 0, 0, 0);
    }

    private static void admin() {
        AuthContext.set(new AuthPrincipal(1, "admin", List.of("ADMIN"), List.of(), "test", 0));
    }
}
