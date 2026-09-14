package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectSessionAccessTest {
    @Test void blocksDirectResumeAndAdditionalDirectoriesButAllowsStop() {
        var sessions = mock(ClaudeChatSessionRepository.class);
        Path excluded = Path.of("excluded").toAbsolutePath();
        ProjectAccess policy = path -> !path.toAbsolutePath().startsWith(excluded);
        var guard = new ProjectSessionAccess(policy, sessions);
        when(sessions.findById("old")).thenReturn(Optional.of(ClaudeChatSession.builder().cwd(excluded.toString()).build()));
        assertThatThrownBy(() -> guard.check(Map.of("type", "start", "cwd", excluded.toString()))).hasMessageContaining("全局排除");
        assertThatThrownBy(() -> guard.check(Map.of("type", "user", "sessionId", "old"))).hasMessageContaining("全局排除");
        assertThatThrownBy(() -> guard.check(Map.of("type", "user", "additionalDirectories", List.of(excluded.resolve("src").toString())))).hasMessageContaining("全局排除");
        assertThatCode(() -> guard.check(Map.of("type", "interrupt", "sessionId", "old"))).doesNotThrowAnyException();
    }
}
