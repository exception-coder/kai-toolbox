package com.exceptioncoder.toolbox.claudechat.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import com.exceptioncoder.toolbox.common.auth.service.TokenService;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import java.util.List;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

class ConsultClientTicketsTest {

    private final TokenService tokens = mock(TokenService.class);
    private final AuthProperties props = new AuthProperties();
    private ConsultClientTickets tickets;

    @BeforeEach
    void setUp() {
        var beans = new StaticListableBeanFactory();
        beans.addBean("tokens", tokens);
        beans.addBean("props", props);
        tickets = new ConsultClientTickets(
            true,
            beans.getBeanProvider(TokenService.class),
            beans.getBeanProvider(AuthProperties.class)
        );
        AuthContext.set(
            new AuthPrincipal(
                7,
                "user",
                List.of(),
                List.of(),
                "jwt",
                System.currentTimeMillis() + 60_000
            )
        );
    }

    @AfterEach
    void cleanup() {
        AuthContext.clear();
    }

    @Test
    void ticketIsOneTimeAndDoesNotExposeAccessToken() {
        var value = tickets.issue(null, "https://forge.test");
        assertThat(value.ticket()).hasSize(43);
        assertThat(tickets.consume(value.ticket(), null).userId()).isEqualTo(7);
        assertThatThrownBy(() ->
            tickets.consume(value.ticket(), null)
        ).hasMessageContaining("401");
    }

    @Test
    void crossOriginMustBeExplicitAndCannotChangeAtHandshake() {
        assertThatThrownBy(() ->
            tickets.issue("https://erp.test", "https://forge.test")
        ).hasMessageContaining("403");
        props.getExternalLogin().setEnabled(true);
        props.getExternalLogin().setAllowedOrigins(List.of("https://erp.test"));
        var value = tickets.issue("https://erp.test", "https://forge.test");
        assertThatThrownBy(() ->
            tickets.consume(value.ticket(), "https://other.test")
        ).hasMessageContaining("401");
    }

    @Test
    void logoutRevokesPreviouslyIssuedTicket() {
        var value = tickets.issue(null, "https://forge.test");
        when(tokens.isBlacklisted("jwt")).thenReturn(true);
        assertThatThrownBy(() ->
            tickets.consume(value.ticket(), null)
        ).hasMessageContaining("401");
    }

    @Test
    void expiredIdentityCannotIssueAndCapacityIsBounded() {
        for (int i = 0; i < 8; i++) tickets.issue(null, "https://forge.test");
        assertThatThrownBy(() ->
            tickets.issue(null, "https://forge.test")
        ).hasMessageContaining("429");
        AuthContext.set(
            new AuthPrincipal(7, "user", List.of(), List.of(), "expired", 0)
        );
        assertThatThrownBy(() ->
            tickets.issue(null, "https://forge.test")
        ).hasMessageContaining("401");
    }

    @Test
    void disabledIntegrationNeverIssuesTickets() {
        var beans = new StaticListableBeanFactory();
        beans.addBean("tokens", tokens);
        beans.addBean("props", props);
        var disabled = new ConsultClientTickets(
            false,
            beans.getBeanProvider(TokenService.class),
            beans.getBeanProvider(AuthProperties.class)
        );
        assertThatThrownBy(() ->
            disabled.issue(null, "https://forge.test")
        ).hasMessageContaining("503");
    }
}
