package com.exceptioncoder.toolbox.foreconsult.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultClientRequestRepository;
import com.exceptioncoder.toolbox.llm.spi.ConsultClientRuntime;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

class ConsultClientApplicationServiceTest {

    private final ConsultService sessions = mock(ConsultService.class);
    private final ConsultSourceRoutingService source = mock(
        ConsultSourceRoutingService.class
    );
    private final ConsultDispatchService dispatch = mock(
        ConsultDispatchService.class
    );
    private final ConsultWorkflowSessionService workflows = mock(
        ConsultWorkflowSessionService.class
    );
    private final ConsultClientRuntime runtime = mock(
        ConsultClientRuntime.class
    );
    private ConsultClientApplicationService application;
    private final ConsultSession session = ConsultSession.builder()
        .sessionId("c")
        .userId("7")
        .questionTitle("261030-问题")
        .systemSourcePath("D:/project")
        .model("model")
        .codexHome("account")
        .evidenceSystems("[]")
        .devSessionId("r")
        .archiveStatus("PENDING")
        .promptSnapshot("prompt")
        .build();

    @BeforeEach
    void setUp() throws Exception {
        var data = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        var jdbc = new JdbcTemplate(data);
        String ddl = new String(
            getClass()
                .getResourceAsStream("/db/consult-client-schema.sql")
                .readAllBytes(),
            java.nio.charset.StandardCharsets.UTF_8
        );
        for (String part : ddl.split(";"))
            if (!part.isBlank()) jdbc.execute(part);
        application = new ConsultClientApplicationService(
            sessions,
            source,
            dispatch,
            workflows,
            runtime,
            new ConsultClientRequestRepository(jdbc),
            new ObjectMapper(),
            new DataSourceTransactionManager(data)
        );
        AuthContext.set(
            new AuthPrincipal(
                7,
                "user",
                List.of("ADMIN"),
                List.of(),
                "jwt",
                Long.MAX_VALUE
            )
        );
        when(sessions.get("c")).thenReturn(session);
    }

    @AfterEach
    void cleanup() {
        AuthContext.clear();
    }

    @Test
    void firstQuestionCreatesCanonicalConsultationAndRetryDoesNotCreateAnother() {
        when(source.prepare(any())).thenAnswer(call ->
            new ConsultSourceRoutingService.Prepared(call.getArgument(0), null)
        );
        var initial = new ConsultInitialDispatch(null, null);
        when(dispatch.initial(any())).thenReturn(initial);
        when(source.decorate(initial, null)).thenReturn(initial);
        when(
            workflows.start(any(StartSessionRequest.class), eq(initial))
        ).thenReturn(session);
        var first = application.prepare("request-123", null, "问题", List.of());
        assertThat(first.session().consultationId()).isEqualTo("c");
        application.prepare("request-123", "c", "问题", List.of());
        verify(workflows, times(1)).start(any(), any());
        verify(runtime, times(1)).create(any());
        assertThatThrownBy(() ->
            application.prepare("request-123", "c", "改了内容", List.of())
        ).hasMessageContaining("409");
    }

    @Test
    void adminCannotUseExternalClientToReadAnotherUsersHistoryAndArchiveIsReadonly() {
        session.setUserId("8");
        assertThatThrownBy(() ->
            application.require("c", false)
        ).hasMessageContaining("403");
        session.setUserId("7");
        session.setArchiveStatus("SUCCESS");
        assertThat(application.require("c", false).consultationId()).isEqualTo(
            "c"
        );
        assertThatThrownBy(() ->
            application.require("c", true)
        ).hasMessageContaining("409");
    }
}
