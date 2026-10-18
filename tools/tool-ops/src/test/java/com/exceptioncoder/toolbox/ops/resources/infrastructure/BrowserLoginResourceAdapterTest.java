package com.exceptioncoder.toolbox.ops.resources.infrastructure;

import com.exceptioncoder.toolbox.ops.resources.application.ApplicationResourceService;
import com.exceptioncoder.toolbox.ops.resources.domain.ApplicationResource;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BrowserLoginResourceAdapterTest {
    private ApplicationResource resource(String id, String environment) {
        return new ApplicationResource(id, "测试账号", environment, "https://test.example", ApplicationResource.AuthType.FORM_COOKIE,
                "/login", "tester", "private-password", "username", "password", "token", null, null, 1, 1);
    }
    @Test void reusesExistingTestAccountsAndRejectsProduction() {
        ApplicationResourceService resources = mock(ApplicationResourceService.class);
        when(resources.list()).thenReturn(List.of(resource("test", "TEST"), resource("prod", "PROD")));
        when(resources.required("test")).thenReturn(resource("test", "TEST"));
        when(resources.required("prod")).thenReturn(resource("prod", "PROD"));
        BrowserLoginResourceAdapter adapter = new BrowserLoginResourceAdapter(resources);
        assertEquals(List.of("test"), adapter.targets().stream().map(target -> target.id()).toList());
        assertEquals("private-password", adapter.require("test").password());
        assertThrows(IllegalArgumentException.class, () -> adapter.require("prod"));
    }
}
