package com.exceptioncoder.toolbox.foreconsult.suggestion;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.web.*;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.*;
import org.springframework.web.method.HandlerMethod;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultSuggestionTest {
    @TempDir Path directory;
    ConsultSuggestionService service;
    AgentOneShotRunner runner;
    ConsultSuggestionRepository repository;

    @BeforeEach @SuppressWarnings("unchecked") void setup() {
        var dataSource = new DriverManagerDataSource("jdbc:sqlite:" + directory.resolve("suggestions.db"));
        var schema = new ResourceDatabasePopulator(new ClassPathResource("db/consult-suggestion-schema.sql"));
        schema.execute(dataSource); schema.execute(dataSource);
        repository = new ConsultSuggestionRepository(new JdbcTemplate(dataSource));
        runner = mock(AgentOneShotRunner.class);
        ObjectProvider<AgentOneShotRunner> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(runner);
        service = new ConsultSuggestionService(repository, provider, new ObjectMapper());
    }
    @AfterEach void clear() { AuthContext.clear(); }
    ConsultSuggestion.Draft draft() { return new ConsultSuggestion.Draft("手机回答定位", "长回答难以定位", "回到最新消息", "点击后看到最新消息"); }

    @Test void savesOriginalAndEditedDescriptionAndReusesOnlySameUserAndRequest() {
        String key = UUID.randomUUID().toString();
        var request = new ConsultSuggestion.Submit(key, "手机看回答不好找", draft());
        var saved = service.submit(7, request);
        assertThat(service.submit(7, request)).isEqualTo(saved);
        assertThat(service.list(0).total()).isEqualTo(1);
        assertThat(saved.original()).isEqualTo(request.original());
        assertThatThrownBy(() -> service.submit(7, new ConsultSuggestion.Submit(key, "换了想法", draft())))
                .hasMessageContaining("409");
        assertThat(service.list(0).total()).isEqualTo(1);
        assertThat(service.submit(8, request).id()).isNotEqualTo(saved.id());
        assertThat(service.list(0).total()).isEqualTo(2);
        verifyNoInteractions(runner);
    }

    @Test void listIsBoundedAndInvalidInputsNeverCreateRows() {
        for (int index = 0; index < 23; index++) {
            service.submit(7, new ConsultSuggestion.Submit(UUID.randomUUID().toString(), "原始建议" + index, draft()));
        }
        assertThat(service.list(0).items()).hasSize(20);
        assertThat(service.list(20).items()).hasSize(3);
        assertThat(service.list(0).items()).doesNotContainAnyElementsOf(service.list(20).items());
        assertThatThrownBy(() -> service.list(-1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.submit(7, new ConsultSuggestion.Submit("invalid", "原文", draft()))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.submit(7, new ConsultSuggestion.Submit(UUID.randomUUID().toString(), "原文", new ConsultSuggestion.Draft("", "问题", "改进", "")))).isInstanceOf(IllegalArgumentException.class);
        assertThat(service.list(0).total()).isEqualTo(23);
    }

    @Test void normalizationUsesDisabledToolsAndDoesNotPersistUnconfirmedModelOutput() {
        when(runner.runOnce(any(AgentOneShotRunner.ExecutionRequest.class))).thenReturn("{\"title\":\"手机回答定位\",\"problem\":\"长回答难以定位\",\"expected\":\"回到最新消息\",\"acceptance\":\"\"}");
        assertThat(service.normalize("手机长回答能加一个回到最后的按钮吗").title()).isEqualTo("手机回答定位");
        var captured = ArgumentCaptor.forClass(AgentOneShotRunner.ExecutionRequest.class);
        verify(runner).runOnce(captured.capture());
        assertThat(captured.getValue().toolPolicy()).isEqualTo(AgentOneShotRunner.TOOL_POLICY_DISABLED);
        assertThat(captured.getValue().cwd()).isNull();
        assertThat(captured.getValue().userPrompt()).isEqualTo("手机长回答能加一个回到最后的按钮吗");
        assertThat(service.list(0).total()).isZero();
    }

    @Test void invalidModelOutputIsRecoverableAndCanBeManuallySubmitted() {
        when(runner.runOnce(any(AgentOneShotRunner.ExecutionRequest.class))).thenReturn("{\"title\":23}");
        assertThatThrownBy(() -> service.normalize("希望手机更方便")).hasMessageContaining("自动整理未完成");
        assertThat(service.list(0).total()).isZero();
        assertThat(service.submit(7, new ConsultSuggestion.Submit(UUID.randomUUID().toString(), "希望手机更方便", draft())).id()).isNotBlank();
    }

    @Test void allEndpointsRequireLoginAndAuthorComesFromServerContext() throws Exception {
        var controller = new ConsultSuggestionController(service);
        var interceptor = new RequireAuthInterceptor();
        for (var method : List.of(ConsultSuggestionController.class.getMethod("list", int.class),
                ConsultSuggestionController.class.getMethod("normalize", ConsultSuggestionController.Normalize.class),
                ConsultSuggestionController.class.getMethod("submit", ConsultSuggestion.Submit.class))) {
            AuthContext.clear();
            var handler = new HandlerMethod(controller, method);
            assertThatThrownBy(() -> interceptor.preHandle(new MockHttpServletRequest(), new MockHttpServletResponse(), handler)).isInstanceOf(AuthException.class);
            AuthContext.set(new AuthPrincipal(7, "tester", List.of("USER"), List.of(), "test", 0));
            assertThat(interceptor.preHandle(new MockHttpServletRequest(), new MockHttpServletResponse(), handler)).isTrue();
        }
        var request = new ConsultSuggestion.Submit(UUID.randomUUID().toString(), "建议", draft());
        var saved = controller.submit(request);
        assertThat(repository.find(7, request.requestId())).contains(saved);
        assertThat(repository.find(8, request.requestId())).isEmpty();
    }
}
