package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionCustomSite;
import com.exceptioncoder.toolbox.claudechat.domain.SessionSiteConfiguration;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionSiteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionSiteServiceTest {

    private ClaudeChatSessionRepository sessionRepository;
    private SessionSiteRepository siteRepository;
    private SessionSiteService service;

    @BeforeEach
    void setUp() {
        sessionRepository = mock(ClaudeChatSessionRepository.class);
        siteRepository = mock(SessionSiteRepository.class);
        service = new SessionSiteService(sessionRepository, siteRepository);
        when(sessionRepository.findById("session-1"))
                .thenReturn(Optional.of(mock(ClaudeChatSession.class)));
    }

    @Test
    void getConfigurationReturnsBothSiteSources() {
        SessionCustomSite customSite = new SessionCustomSite(
                "custom-1", "ERP 入仓页", "http://localhost/index.jsp#/warehouse");
        when(siteRepository.findSiteIds("session-1")).thenReturn(List.of("quick-1"));
        when(siteRepository.findCustomSites("session-1")).thenReturn(List.of(customSite));

        Optional<SessionSiteConfiguration> result = service.getConfiguration("session-1");

        assertThat(result).contains(new SessionSiteConfiguration(List.of("quick-1"), List.of(customSite)));
    }

    @Test
    void replaceConfigurationNormalizesAndPersistsBothSources() {
        SessionSiteConfiguration configuration = new SessionSiteConfiguration(
                List.of(" quick-1 ", "quick-1", "quick-2"),
                List.of(
                        new SessionCustomSite(" custom-1 ", " ERP 入仓页 ",
                                " http://localhost/index.jsp#/warehouse "),
                        new SessionCustomSite("custom-1", "重复项", "http://localhost/duplicate")));

        boolean replaced = service.replaceConfiguration("session-1", configuration);

        assertThat(replaced).isTrue();
        verify(siteRepository).replace(eq("session-1"), eq(List.of("quick-1", "quick-2")), anyLong());
        verify(siteRepository).replaceCustomSites(eq("session-1"), eq(List.of(
                new SessionCustomSite("custom-1", "ERP 入仓页",
                        "http://localhost/index.jsp#/warehouse"))), anyLong());
    }

    @Test
    void replaceConfigurationRejectsUnsafeCustomUrl() {
        SessionSiteConfiguration configuration = new SessionSiteConfiguration(List.of(), List.of(
                new SessionCustomSite("custom-1", "危险地址", "https://user:secret@example.com/path")));

        assertThatThrownBy(() -> service.replaceConfiguration("session-1", configuration))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("临时站点地址不能包含用户名或密码");
    }

    @Test
    void replaceConfigurationRejectsMoreThanTwentySites() {
        List<String> quickSiteIds = IntStream.range(0, 21).mapToObj(index -> "quick-" + index).toList();
        SessionSiteConfiguration configuration = new SessionSiteConfiguration(quickSiteIds, List.of());

        assertThatThrownBy(() -> service.replaceConfiguration("session-1", configuration))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("每个会话最多关联 20 个测试站点");
    }
}
