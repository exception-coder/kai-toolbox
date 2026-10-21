package com.exceptioncoder.toolbox.foreconsult.suggestion;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultDevelopmentSessionTest {
    @TempDir Path directory;
    JdbcTemplate database() {
        var source = new DriverManagerDataSource("jdbc:sqlite:" + directory.resolve("session.db"));
        var schema = new ResourceDatabasePopulator(new ClassPathResource("db/consult-development-session-schema.sql"));
        schema.execute(source); schema.execute(source);
        return new JdbcTemplate(source);
    }

    @Test void sameListSessionSurvivesReloadAndHistoryUsesStableDescendingCursor() {
        var jdbc = database(); var session = new ConsultDevelopmentSession(jdbc);
        assertThat(session.read(0).id()).isNull();
        for (int index = 0; index < 55; index++) session.append("suggestion-" + index, "待实现", "审核已接收");
        var first = session.read(0);
        assertThat(first.id()).isEqualTo(ConsultDevelopmentSession.ID);
        assertThat(first.messages()).hasSize(50); assertThat(first.hasMore()).isTrue();
        var older = new ConsultDevelopmentSession(jdbc).read(first.nextBefore());
        assertThat(older.messages()).hasSize(5); assertThat(older.hasMore()).isFalse();
        assertThat(first.messages()).doesNotContainAnyElementsOf(older.messages());
        assertThatThrownBy(() -> session.read(-1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test @SuppressWarnings("unchecked") void modelUsesRealObservedReplyAndKeepsNativeIdentityPrivate() throws Exception {
        var jdbc = database(); var session = new ConsultDevelopmentSession(jdbc);
        var runner = mock(AgentOneShotRunner.class);
        ObjectProvider<AgentOneShotRunner> provider = mock(ObjectProvider.class); when(provider.getIfAvailable()).thenReturn(runner);
        when(runner.runObserved(any())).thenReturn(new AgentOneShotRunner.ObservedResult("{\"outcome\":\"MANUAL\"}", "trace-1", null, null, "native-session-1"));
        var model = new ConsultSuggestionModel(provider, new ObjectMapper(), session);
        assertThat(model.ask("suggestion-1", "编码", "指令", java.util.Map.of("text", "数据")).path("outcome").asText()).isEqualTo("MANUAL");
        var request = org.mockito.ArgumentCaptor.forClass(AgentOneShotRunner.ExecutionRequest.class);
        verify(runner).runObserved(request.capture());
        assertThat(request.getValue().toolPolicy()).isEqualTo("disabled"); assertThat(request.getValue().cwd()).isNull();
        assertThat(jdbc.queryForObject("SELECT engine_session_id FROM consult_development_message WHERE engine_session_id IS NOT NULL", String.class)).isEqualTo("native-session-1");
        String publicView = new ObjectMapper().writeValueAsString(session.read(0));
        assertThat(publicView).contains("编码模型已返回").doesNotContain("native-session-1", "trace-1", "outcome");
    }
}
