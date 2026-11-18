package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatWsProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.nio.file.Path;
import java.net.ServerSocket;
import java.net.InetAddress;
import java.io.OutputStream;
import java.util.concurrent.TimeUnit;
import java.nio.file.Files;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SidecarProcessRegistryTest {

    @Test
    void recoveryMarkerPreventsReturningOrRestartingAnExistingProcess(@TempDir Path root) throws Exception {
        var props = new ClaudeChatProperties();
        props.setSidecarDir(root.toString());
        Path marker = SidecarSdkUpgradeWorkspace.recoveryMarker(root);
        Files.createDirectories(marker.getParent());
        Files.writeString(marker, "batch backup");
        var registry = new SidecarProcessRegistry(props, new ObjectMapper(), 18080, mock(ProviderProfileService.class));
        var process = mock(Process.class);
        when(process.isAlive()).thenReturn(true);
        ReflectionTestUtils.setField(registry, "process", process);
        assertThatThrownBy(registry::ensureStarted).hasMessageContaining("切换状态待核对");
        assertThatThrownBy(registry::restart).hasMessageContaining("切换状态待核对");
        verify(process, never()).destroy();
    }

    @Test
    void upgradeRejectsLingeringDescendantAfterListenerHasStopped(@TempDir Path root) throws Exception {
        var properties = new ClaudeChatProperties();
        properties.setSidecarDir(root.toString());
        Files.createDirectories(root.resolve("dist"));
        Files.writeString(root.resolve("dist/server.js"), "");
        try (var listener = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
            properties.setSidecarPort(listener.getLocalPort());
        }
        var registry = new SidecarProcessRegistry(properties, new ObjectMapper(), 18080, mock(ProviderProfileService.class));
        var parent = mock(Process.class);
        var child = mock(ProcessHandle.class);
        when(parent.isAlive()).thenReturn(true);
        when(parent.getOutputStream()).thenReturn(OutputStream.nullOutputStream());
        when(parent.waitFor(3, TimeUnit.SECONDS)).thenReturn(true);
        when(parent.descendants()).thenReturn(java.util.stream.Stream.of(child));
        when(child.isAlive()).thenReturn(true);
        when(child.pid()).thenReturn(4321L);
        ReflectionTestUtils.setField(registry, "process", parent);
        assertThatThrownBy(registry::stopForSdkUpgrade).isInstanceOf(IOException.class)
                .hasMessageContaining("子进程尚未退出", "4321");
        verify(child, never()).destroy();
        verify(child, never()).destroyForcibly();
        when(child.isAlive()).thenReturn(false);
        registry.stopForSdkUpgrade();
    }

    @Test
    void shouldKeepHostAvailableButRejectBlockedAiStartup() {
        new ApplicationContextRunner().withUserConfiguration(RuntimeFixture.class)
                .withPropertyValues("toolbox.claude-chat.sidecar-startup-error=端口归属未确认，AI 运行时未启动")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    SidecarProcessRegistry registry = context.getBean(SidecarProcessRegistry.class);
                    assertThatThrownBy(registry::ensureStarted)
                            .isInstanceOf(IOException.class).hasMessageContaining("归属未确认");
                    assertThat(registry.isAlive()).isFalse();
                    SidecarClient client = context.getBean(SidecarClient.class);
                    assertThatThrownBy(client::ensureConnected)
                            .isInstanceOf(IOException.class).hasMessageContaining("归属未确认");
                    assertThat(client.isConnected()).isFalse();
                });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ClaudeChatProperties.class)
    static class RuntimeFixture {
        @Bean
        ProjectSessionAccess projectSessionAccess() {
            return mock(ProjectSessionAccess.class);
        }

        @Bean
        SidecarProcessRegistry registry(ClaudeChatProperties properties) {
            return new SidecarProcessRegistry(properties, new ObjectMapper(), 18080, mock(ProviderProfileService.class));
        }

        @Bean
        SidecarClient client(ClaudeChatProperties properties) {
            return new SidecarClient(properties, new ClaudeChatWsProperties(), new ObjectMapper());
        }
    }

    @Test
    void shouldNotAdoptAnUnknownListenerAsHealthySidecar() throws Exception {
        try (ServerSocket listener = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
            ClaudeChatProperties properties = new ClaudeChatProperties();
            properties.setSidecarPort(listener.getLocalPort());
            SidecarProcessRegistry registry = new SidecarProcessRegistry(properties, new ObjectMapper(), 18080, mock(ProviderProfileService.class));
            ReflectionTestUtils.setField(registry, "orphanCleaned", true);
            assertThat(registry.isAlive()).isFalse();
            assertThatThrownBy(registry::ensureStarted).isInstanceOf(IOException.class).hasMessageContaining("拒绝连接未知实例");
            assertThat(listener.isClosed()).isFalse();
        }
    }

    @Test
    void shouldRequireExactAbsoluteEntryBeforeConsideringOrphanCleanup() {
        Path entry = Path.of("sidecar/claude-agent/dist/server.js").toAbsolutePath().normalize();
        assertThat(SidecarProcessRegistry.isOwnedSidecarCommand("node", new String[]{entry.toString()}, entry)).isTrue();
        assertThat(SidecarProcessRegistry.isOwnedSidecarCommand("java", new String[]{entry.toString()}, entry)).isFalse();
        assertThat(SidecarProcessRegistry.isOwnedSidecarCommand("node", new String[]{"dist/server.js"}, entry)).isFalse();
        assertThat(SidecarProcessRegistry.isOwnedSidecarCommand("node", new String[]{entry + ".other"}, entry)).isFalse();
        assertThat(SidecarProcessRegistry.isOwnedSidecarCommand("node", new String[]{"-e", entry.toString()}, entry)).isFalse();
        assertThat(SidecarProcessRegistry.isOwnedSidecarCommand("", new String[]{}, entry)).isFalse();
    }

    @Test
    void shouldCloseOwnerPipeAndWaitForExitBeforeDroppingHandle() throws Exception {
        SidecarProcessRegistry registry = new SidecarProcessRegistry(new ClaudeChatProperties(), new ObjectMapper(), 18080, mock(ProviderProfileService.class));
        Process child = mock(Process.class);
        OutputStream input = mock(OutputStream.class);
        when(child.isAlive()).thenReturn(true);
        when(child.getOutputStream()).thenReturn(input);
        when(child.waitFor(3, TimeUnit.SECONDS)).thenReturn(true);
        ReflectionTestUtils.setField(registry, "process", child);
        registry.shutdown();
        var order = inOrder(input, child);
        order.verify(input).close();
        order.verify(child).waitFor(3, TimeUnit.SECONDS);
        verify(child, never()).destroyForcibly();
        assertThat(ReflectionTestUtils.getField(registry, "process")).isNull();
        assertThatThrownBy(registry::ensureStarted).isInstanceOf(IOException.class).hasMessageContaining("正在关闭");
    }

    @Test
    void shouldRetainUnconfirmedProcessUntilOwnedTreeCleanup() throws Exception {
        SidecarProcessRegistry registry = new SidecarProcessRegistry(new ClaudeChatProperties(), new ObjectMapper(), 18080, mock(ProviderProfileService.class));
        Process child = mock(Process.class);
        when(child.isAlive()).thenReturn(true);
        when(child.getOutputStream()).thenReturn(OutputStream.nullOutputStream());
        ReflectionTestUtils.setField(registry, "process", child);
        registry.shutdown();
        verify(child).destroyForcibly();
        verify(child, times(2)).waitFor(1, TimeUnit.SECONDS);
        assertThat(ReflectionTestUtils.getField(registry, "process")).isSameAs(child);
    }

    @Test
    void shouldPassDeepSeekRuntimeArgumentsAsStructuredJson() throws IOException {
        ClaudeChatProperties properties = new ClaudeChatProperties();
        ClaudeChatProperties.DeepSeekHarness harness = properties.getDeepseekHarness();
        harness.setEnabled(true);
        harness.setCommand("node");
        harness.setArgs(List.of("runtime entry.js", "--profile", "review mode"));
        harness.setProvider("deepseek-official");
        harness.setModel("deepseek-v4-flash");
        harness.setMaxTokens(49_152);
        harness.setHandshakeTimeoutMs(12_000);
        harness.setTurnTimeoutMs(90_000);

        SidecarProcessRegistry registry = new SidecarProcessRegistry(properties, new ObjectMapper(), 18080, mock(ProviderProfileService.class));
        ProcessBuilder builder = new ProcessBuilder("node", "dist/server.js");

        registry.applyDeepSeekHarnessEnvironment(builder);

        Map<String, String> environment = builder.environment();
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_ENABLED")).isEqualTo("true");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_COMMAND")).isEqualTo("node");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_ARGS"))
                .isEqualTo("[\"runtime entry.js\",\"--profile\",\"review mode\"]");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_PROVIDER")).isEqualTo("deepseek-official");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_MODEL")).isEqualTo("deepseek-v4-flash");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_MAX_TOKENS")).isEqualTo("49152");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_HANDSHAKE_TIMEOUT_MS")).isEqualTo("12000");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_TURN_TIMEOUT_MS")).isEqualTo("90000");
    }

    @Test
    void shouldKeepExperimentalRuntimeDisabledWhenExplicitlyConfigured() throws IOException {
        ClaudeChatProperties properties = new ClaudeChatProperties();
        properties.getDeepseekHarness().setEnabled(false);
        SidecarProcessRegistry registry = new SidecarProcessRegistry(properties, new ObjectMapper(), 18080, mock(ProviderProfileService.class));
        ProcessBuilder builder = new ProcessBuilder("node", "dist/server.js");

        registry.applyDeepSeekHarnessEnvironment(builder);

        assertThat(builder.environment().get("KAI_DEEPSEEK_HARNESS_ENABLED")).isEqualTo("false");
        assertThat(builder.environment()).doesNotContainKey("KAI_DEEPSEEK_HARNESS_COMMAND");
    }

    @Test
    void shouldPassOnlyGlobalHarnessCredentialToItsPrivateEnvironmentSlot() throws IOException {
        ProviderProfileService profiles = mock(ProviderProfileService.class);
        when(profiles.globalHarnessCredentials()).thenReturn(java.util.Optional.of(
                new ProviderProfileService.ProviderCredentials("https://api.deepseek.com/v1", "global-test-key")));
        SidecarProcessRegistry registry = new SidecarProcessRegistry(new ClaudeChatProperties(), new ObjectMapper(), 18080, profiles);
        ProcessBuilder builder = new ProcessBuilder("node");
        builder.environment().remove("DEEPSEEK_API_KEY");
        builder.environment().remove("KAI_DEEPSEEK_HARNESS_API_KEY");
        registry.applyDeepSeekHarnessEnvironment(builder);
        assertThat(builder.environment().get("KAI_DEEPSEEK_HARNESS_API_KEY")).isEqualTo("global-test-key");
        assertThat(builder.environment()).doesNotContainKey("DEEPSEEK_API_KEY");
        builder.environment().put("KAI_DEEPSEEK_HARNESS_API_KEY", "explicit-test-key");
        registry.applyDeepSeekHarnessEnvironment(builder);
        assertThat(builder.environment().get("KAI_DEEPSEEK_HARNESS_API_KEY")).isEqualTo("explicit-test-key");
    }
}
