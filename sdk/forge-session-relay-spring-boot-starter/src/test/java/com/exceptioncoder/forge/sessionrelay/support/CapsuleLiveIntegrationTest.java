package com.exceptioncoder.forge.sessionrelay.support;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import com.exceptioncoder.forge.sessionrelay.autoconfigure.ForgeSessionRelayProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.web.client.RestClient;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import static org.assertj.core.api.Assertions.assertThat;

/** 显式启用的真实 Forge 冒烟；凭据仅通过测试进程环境提供。 */
@EnabledIfEnvironmentVariable(named = "FORGE_CAPSULE_LIVE_TEST", matches = "true")
class CapsuleLiveIntegrationTest {
    @Test
    void opensReadonlyConsultationAndReceivesModelAnswer() throws Exception {
        var properties = new ForgeSessionRelayProperties();
        properties.setCapsuleMode(true);
        properties.setForgeBaseUrl(System.getenv("FORGE_CAPSULE_TEST_URL"));
        properties.setClientId("yoooni-one");
        properties.setClientSecret(System.getenv("FORGE_CAPSULE_TEST_SECRET"));
        var upstream = new ForgeRelayUpstreamClient(properties, RestClient.builder());
        var binding = new ForgeRelayBinding(990000001, "", Instant.MAX, "", "");
        var mapper = new ObjectMapper();
        var ready = new CompletableFuture<String>();
        var done = new CompletableFuture<String>();
        var answer = new StringBuilder();
        var client = new StandardWebSocketClient();
        var uri = upstream.createWebSocketUri(binding);
        var session = client.execute(new TextWebSocketHandler() {
            @Override
            public void afterConnectionEstablished(WebSocketSession socket) {
                socket.setTextMessageSizeLimit(262144);
            }
            @Override
            public void afterConnectionClosed(WebSocketSession socket, org.springframework.web.socket.CloseStatus status) {
                done.completeExceptionally(new IllegalStateException("Socket closed: " + status));
            }
            @Override
            protected void handleTextMessage(WebSocketSession socket, TextMessage message) throws Exception {
                var node = mapper.readTree(message.getPayload());
                System.out.println("Capsule event: " + node.path("type").asText());
                switch (node.path("type").asText()) {
                    case "ready" -> ready.complete(node.path("sessionId").asText());
                    case "assistantDelta" -> answer.append(node.path("text").asText());
                    case "result" -> done.complete(answer.toString());
                    case "error" -> {
                        var error = new IllegalStateException(node.path("code").asText() + ": " + node.path("message").asText());
                        ready.completeExceptionally(error);
                        done.completeExceptionally(error);
                    }
                    default -> { }
                }
            }
        }, upstream.webSocketHeaders(binding, uri), uri).get(20, TimeUnit.SECONDS);
        try {
            session.sendMessage(new TextMessage(mapper.writeValueAsString(Map.of("type", "open",
                    "assistantPageKey", "garment-sample-management", "assistantPageUrl", "/garment-samples"))));
            String sessionId = ready.get(40, TimeUnit.SECONDS);
            System.out.println("Capsule live session ready: " + sessionId);
            String question = "这是彩虹胶囊只读接入验收。系统 Yoooni One，URL /garment-samples，模块 garment-sample-management。"
                    + "用户问题：样衣借用记录太多，想快点找到逾期的。请先定位对应模块的 OpenSpec 或代码，只读核对当前行为；不要改代码或数据。"
                    + "整理成需求或优化项，输出一句清晰表述和 requirement-json 代码块，字段 title,kind,summary,current,expected,scope,acceptance,evidence,questions。"
                    + "后三个字段为字符串数组，kind 为需求/BUG/优化，summary 为一句话。信息不足保留 questions。";
            session.sendMessage(new TextMessage(mapper.writeValueAsString(Map.of("type", "send", "text", question))));
            String result = done.get(240, TimeUnit.SECONDS);
            assertThat(result).isNotBlank();
            System.out.println("Capsule live answer: " + result);
            assertThat(result).contains("requirement-json");
            assertThat(upstream.capsuleApi(binding.subjectUserId(),
                    "/api/assistant/conversations/" + sessionId + "/messages?limit=10", "GET", null, null)
                    .getStatusCode().value()).isEqualTo(200);
        } finally {
            session.close();
        }
    }
}
