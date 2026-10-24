package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

class SessionPinServiceTest {
    @AfterEach void clearUser() { AuthContext.clear(); }

    @Test
    void persistsPinsPerUserAndKeepsOwnerLegacyFavoritesWithoutSharingAdminPreferences() {
        try (var connection = new SingleConnectionDataSource("jdbc:sqlite::memory:", true)) {
            var jdbc = new JdbcTemplate(connection);
            jdbc.execute("CREATE TABLE claude_chat_setting (name TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
            var settings = new ClaudeChatSettingRepository(jdbc);
            var pins = new SessionPinService(settings, new ObjectMapper());
            var owned = ClaudeChatSession.builder().id("session-a").userId(1L).favorite(true).lastSeenAt(100).build();
            user(1);
            assertThat(pins.current().state(owned).pinned()).isTrue();
            pins.set("session-a", false);
            pins.set("session-b", true);
            long timestamp = pins.current().pins().path("session-b").asLong();
            pins.set("session-b", true);
            assertThat(pins.current().pins().path("session-b").asLong()).isEqualTo(timestamp);
            assertThat(pins.current().state(owned).pinned()).isFalse();

            user(2);
            assertThat(pins.current().state(owned).pinned()).isFalse();
            pins.set("session-a", true);
            assertThat(pins.current().state(owned).pinnedAt()).isPositive();
            user(1);
            var reloaded = new SessionPinService(settings, new ObjectMapper());
            assertThat(reloaded.current().state(owned).pinned()).isFalse();
            assertThat(reloaded.current().pins().path("session-b").asLong()).isEqualTo(timestamp);
            assertThat(owned.getLastSeenAt()).isEqualTo(100);

            AuthContext.clear();
            var local = ClaudeChatSession.builder().id("legacy").favorite(true).build();
            assertThat(pins.current().state(local).pinned()).isTrue();
            pins.set("legacy", false);
            assertThat(pins.current().state(local).pinned()).isFalse();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM claude_chat_setting", Integer.class)).isEqualTo(3);
        }
    }

    private void user(long id) {
        AuthContext.set(new AuthPrincipal(id, "user-" + id, List.of("ADMIN"), List.of(), "test", Long.MAX_VALUE));
    }
}
