package com.exceptioncoder.toolbox.ops.resources;

import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import com.exceptioncoder.toolbox.ops.resources.application.ApplicationResourceExecutor;
import com.exceptioncoder.toolbox.ops.resources.application.ApplicationResourceService;
import com.exceptioncoder.toolbox.ops.resources.domain.ApplicationResource;
import com.exceptioncoder.toolbox.ops.resources.infrastructure.JdbcApplicationResourceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ApplicationResourceServiceTest {
    private final JdbcApplicationResourceRepository repository = mock(JdbcApplicationResourceRepository.class);
    private final ApplicationResourceService service = new ApplicationResourceService(repository);

    @Test
    void preservesPasswordWhenUpdateLeavesItBlank() {
        ApplicationResource existing = resource("secret");
        when(repository.findById("app-1")).thenReturn(Optional.of(existing));

        ApplicationResource updated = service.update("app-1", command(""));

        assertThat(updated.password()).isEqualTo("secret");
        verify(repository).update(updated);
    }

    @Test
    void rejectsNonHttpApplicationAddress() {
        assertThatThrownBy(() -> service.create(new ApplicationResourceService.Command(
                "ERP", "TEST", "file:///tmp/app", "NONE", null, null, null,
                null, null, null, null, null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("HTTP");
        verify(repository, never()).insert(any());
    }

    @Test
    void executorRejectsCrossOriginBeforeSendingRequest() {
        ApplicationResourceExecutor executor = new ApplicationResourceExecutor(new ObjectMapper());
        ResourceCall call = new ResourceCall("CALL", null, "GET", "http://example.org/data", Map.of(), null);

        assertThatThrownBy(() -> executor.execute(resource(null), call))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("同源");
    }

    private static ApplicationResourceService.Command command(String password) {
        return new ApplicationResourceService.Command("ERP 测试", "TEST", "http://127.0.0.1:8081",
                "FORM_COOKIE", "/login", "tester", password, "username", "password",
                "data.accessToken", null, null);
    }

    private static ApplicationResource resource(String password) {
        return new ApplicationResource("app-1", "ERP 测试", "TEST", "http://127.0.0.1:8081",
                ApplicationResource.AuthType.NONE, null, null, password, "username", "password",
                "data.accessToken", null, null, 1, 1);
    }
}
