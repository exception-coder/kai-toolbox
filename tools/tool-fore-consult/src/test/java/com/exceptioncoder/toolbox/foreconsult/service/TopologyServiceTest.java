package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTopologyLinkRepository;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** TopologyService 的引擎路由与空结果持久化边界测试。 */
class TopologyServiceTest {

    @Test
    void defaultsToClaudeAndPersistsNonEmptyResult() {
        AtomicReference<String> usedEngine = new AtomicReference<>();
        ConsultTopologyLinkRepository repository = mock(ConsultTopologyLinkRepository.class);
        TopologyService service = createService(repository, usedEngine,
                "{\"links\":[{\"from\":\"ERP\",\"to\":\"SCM\",\"relation\":\"调用\",\"description\":\"订单同步\"}]}");

        var result = service.analyze(List.of("ERP", "SCM"), null);

        assertThat(usedEngine.get()).isEqualTo("claude");
        assertThat(result.links()).hasSize(1);
        verify(repository).replaceAll(anyList());
    }

    @Test
    void usesCodexAndKeepsPersistedLinksWhenResultIsEmpty() {
        AtomicReference<String> usedEngine = new AtomicReference<>();
        ConsultTopologyLinkRepository repository = mock(ConsultTopologyLinkRepository.class);
        TopologyService service = createService(repository, usedEngine, "{\"links\":[]}");

        var result = service.analyze(List.of("ERP", "SCM"), "codex");

        assertThat(usedEngine.get()).isEqualTo("codex");
        assertThat(result.links()).isEmpty();
        verify(repository, never()).replaceAll(anyList());
    }

    @Test
    void rejectsUnsupportedEngineBeforeAgentCall() {
        AtomicReference<String> usedEngine = new AtomicReference<>();
        ConsultTopologyLinkRepository repository = mock(ConsultTopologyLinkRepository.class);
        TopologyService service = createService(repository, usedEngine, "{\"links\":[]}");

        assertThatThrownBy(() -> service.analyze(List.of("ERP", "SCM"), "gemini"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("仅支持 Claude Code 或 Codex");
        assertThat(usedEngine.get()).isNull();
        verify(repository, never()).replaceAll(anyList());
    }

    /** 创建记录实际引擎并返回固定模型响应的被测服务。 */
    private TopologyService createService(ConsultTopologyLinkRepository repository,
                                          AtomicReference<String> usedEngine,
                                          String response) {
        @SuppressWarnings("unchecked")
        ObjectProvider<AgentOneShotRunner> provider = mock(ObjectProvider.class);
        AgentOneShotRunner runner = new AgentOneShotRunner() {
            @Override
            public String stream(String systemPrompt, String userPrompt, String model, String engine,
                                 Consumer<String> onDelta) {
                return runOnce(systemPrompt, userPrompt, model, engine);
            }

            @Override
            public String runOnce(String systemPrompt, String userPrompt, String model, String engine) {
                usedEngine.set(engine);
                return response;
            }
        };
        when(provider.getIfAvailable()).thenReturn(runner);
        return new TopologyService(provider, repository);
    }
}
