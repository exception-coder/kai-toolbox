package com.exceptioncoder.toolbox.ops.resources.application;

import com.exceptioncoder.toolbox.common.resource.*;
import com.exceptioncoder.toolbox.ops.resources.domain.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultWebResourceServiceTest {
    @Test void validatesFrozenBindingsAndEnvironmentBeforeReadingWithServerSideCredentials() {
        var provider = mock(ResourceProvider.class);
        when(provider.id()).thenReturn("application");
        when(provider.resources()).thenReturn(List.of(resource("dev", "DEV", "https://dev.example.test"),
                resource("uat", "UAT", "https://uat.example.test")));
        var store = mock(ResourceBindingStore.class);
        when(store.list()).thenReturn(List.of(binding("dev", true), binding("uat", true)));
        List<ProjectSystemDirectory> directories = List.of(() -> List.of(new ProjectSystemDirectory.SystemIdentity("erp", "ERP", "/projects/one")));
        var accounts = mock(BrowserLoginResources.class);
        var account = new BrowserLoginTarget("dev", "DEV登录", "DEV", "https://dev.example.test", "tester", "server-secret", "username", "password");
        when(accounts.targets()).thenReturn(List.of(account, new BrowserLoginTarget("uat", "UAT", "UAT", "https://uat.example.test", "tester", "uat-secret", "username", "password"))); when(accounts.require("dev")).thenReturn(account);
        var browser = mock(WebPageReader.class);
        when(browser.read(anyString(), any(), anyString(), anyString())).thenReturn(new WebPageReader.Page("READY", "https://dev.example.test/orders", "订单", "待审订单"));
        var service = new ConsultWebResourceService(new SystemResourceService(List.of(provider), directories, store), directories, List.of(accounts), browser);
        assertEquals(2, service.catalog().size());
        assertEquals("APP", service.catalog().getFirst().kind());
        assertThrows(IllegalArgumentException.class, () -> service.read("run", "/projects/one", List.of("dev", "uat"), new WebResourceGateway.Request("dev", "/orders", null, null)));
        assertThrows(IllegalArgumentException.class, () -> service.read("run", "/projects/one", List.of("dev"), new WebResourceGateway.Request("dev", "/orders", "UAT", null)));
        assertThrows(IllegalArgumentException.class, () -> service.read("run", "/projects/one", List.of("dev"), new WebResourceGateway.Request("dev", "https://uat.example.test/orders", null, null)));
        assertThrows(IllegalArgumentException.class, () -> service.read("run", "/projects/one", List.of(), new WebResourceGateway.Request("dev", "/orders", "DEV", null)));
        verifyNoInteractions(browser);
        var result = (ConsultWebResourceService.Evidence) service.read("run", "/projects/one", List.of("dev", "uat"), new WebResourceGateway.Request("dev", "https://dev.example.test/orders", null, null));
        assertEquals("DEV", result.resource().environment()); assertEquals("tester", result.account());
        verify(browser).read("run:dev", account, "/orders", "/");
        when(accounts.require("dev")).thenReturn(new BrowserLoginTarget("dev", "已变更", "UAT", "https://dev.example.test", "tester", "server-secret", "username", "password"));
        assertThrows(IllegalArgumentException.class, () -> service.read("changed", "/projects/one", List.of("dev"),
                new WebResourceGateway.Request("dev", "/orders", "DEV", null)));
        var sharedDev = new BrowserLoginTarget("dev", "DEV", "DEV", "https://same.test/dev", "tester", "server-secret", "username", "password");
        when(accounts.targets()).thenReturn(List.of(sharedDev, new BrowserLoginTarget("uat", "UAT", "UAT", "https://same.test/uat", "tester", "uat-secret", "username", "password")));
        when(accounts.require("dev")).thenReturn(sharedDev);
        when(provider.resources()).thenReturn(List.of(resource("dev", "DEV", "https://same.test"), resource("uat", "UAT", "https://same.test")));
        assertEquals("https://same.test/dev", service.discover("/projects/one", List.of("dev", "uat")).getFirst().endpoint());
        assertDoesNotThrow(() -> service.read("shared", "/projects/one", List.of("dev", "uat"),
                new WebResourceGateway.Request("dev", "https://same.test/dev/orders", null, null)));
        verify(browser).read("shared:dev", sharedDev, "/dev/orders", "/dev");
        when(store.list()).thenReturn(List.of(binding("dev", false)));
        assertThrows(IllegalArgumentException.class, () -> service.read("run", "/projects/one", List.of("dev"), new WebResourceGateway.Request("dev", "/orders", "DEV", null)));
        when(provider.resources()).thenReturn(List.of(resource("dev", "PROD", "https://dev.example.test")));
        assertThrows(IllegalArgumentException.class, () -> service.read("run", "/projects/one", List.of("dev"), new WebResourceGateway.Request("dev", "/orders", "DEV", null)));
        verify(provider, never()).execute(any(), any());
    }
    @Test void rejectsTraversalEncodedCredentialsAndCrossApplicationPaths() {
        for (String path : List.of("//evil.test", "/dev/../uat", "/dev/%2e%2e/uat", "/dev/a?%70assword=secret", "/dev/a?token=x", "/uat/orders", "https://evil.test/dev")) {
            assertThrows(IllegalArgumentException.class, () -> ConsultWebResourceService.targetPath("https://same.test/dev", path), path);
        }
        for (String base : List.of("https://user:secret@same.test/dev", "https://same.test/dev?password=x", "https://same.test/dev#secret")) {
            assertThrows(IllegalArgumentException.class, () -> ConsultWebResourceService.targetPath(base, "/dev/orders"));
        }
        assertEquals("/dev/orders?id=1", ConsultWebResourceService.targetPath("https://same.test/dev", "https://same.test/dev/orders?id=1"));
    }
    private ResourceBinding binding(String id, boolean enabled) { return new ResourceBinding(id, "erp", "application", id, "页面核查", enabled); }
    private ResourceDescriptor resource(String id, String env, String endpoint) {
        return new ResourceDescriptor(id, id, "APP", env, endpoint, "tester", true, List.of(), "/tools/reqpool/resources?view=accounts");
    }
}
