package com.exceptioncoder.toolbox.ops.resources;

import com.exceptioncoder.toolbox.common.resource.ProjectSystemDirectory;
import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import com.exceptioncoder.toolbox.common.resource.ResourceDescriptor;
import com.exceptioncoder.toolbox.common.resource.ResourceProvider;
import com.exceptioncoder.toolbox.ops.resources.application.SystemResourceService;
import com.exceptioncoder.toolbox.ops.resources.domain.ResourceBinding;
import com.exceptioncoder.toolbox.ops.resources.domain.ResourceBindingStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SystemResourceServiceTest {
    private final ResourceProvider provider = mock(ResourceProvider.class);
    private final ResourceBindingStore store = mock(ResourceBindingStore.class);
    private SystemResourceService service;

    @BeforeEach void setup() {
        when(provider.id()).thenReturn("sql");
        when(provider.resources()).thenReturn(List.of(resource("TEST", List.of("QUERY"))));
        when(store.list()).thenReturn(List.of(binding(true)));
        service = new SystemResourceService(List.of(provider), List.of(() -> List.of(
                new ProjectSystemDirectory.SystemIdentity("system", "系统"))), store);
    }

    @Test void rejectsUnknownSystemWithoutSaving() {
        assertThrows(IllegalArgumentException.class, () -> service.bind("other", "sql", "db", "", true));
        verify(store, never()).save(any());
    }

    @Test void resolvesEnvironmentAgainBeforeExecuting() {
        assertEquals("AVAILABLE", service.discover("system").getFirst().state());
        when(provider.resources()).thenReturn(List.of(resource("PROD", List.of("QUERY"))));
        assertThrows(IllegalArgumentException.class, () -> service.execute("binding", query()));
        verify(provider, never()).execute(any(), any());
    }

    @Test void rejectsMissingEnvironment() {
        when(provider.resources()).thenReturn(List.of(resource(null, List.of("QUERY"))));
        assertEquals("RESTRICTED", service.discover("system").getFirst().state());
        assertThrows(IllegalArgumentException.class, () -> service.execute("binding", query()));
    }

    @Test void rejectsDisabledAndRemovedResources() {
        when(store.list()).thenReturn(List.of(binding(false)));
        assertThrows(IllegalArgumentException.class, () -> service.execute("binding", query()));
        when(store.list()).thenReturn(List.of(binding(true)));
        when(provider.resources()).thenReturn(List.of());
        assertEquals("UNAVAILABLE", service.discover("system").getFirst().state());
        assertThrows(IllegalArgumentException.class, () -> service.execute("binding", query()));
        verify(provider, never()).execute(any(), any());
    }

    @Test void isolatesUnavailableProviderAndRetainsBinding() {
        when(provider.resources()).thenThrow(new IllegalStateException("private connection detail"));
        var catalog = service.catalog();
        assertEquals(List.of("sql"), catalog.unavailableProviders());
        assertEquals(1, catalog.bindings().size());
        assertFalse(catalog.toString().contains("private connection detail"));
    }

    @Test void onlyAdvertisedCapabilityExecutes() {
        when(provider.execute(eq("db"), any())).thenReturn("result");
        assertEquals("result", service.execute("binding", query()));
        assertThrows(IllegalArgumentException.class, () -> service.execute("binding", new ResourceCall("CALL", null, "GET", "/", null, null)));
        verify(provider, times(1)).execute(eq("db"), any());
    }

    @Test void rejectsDuplicateProviderIds() {
        assertThrows(IllegalStateException.class, () -> new SystemResourceService(List.of(provider, provider), List.of(), store));
    }

    @Test void incompleteCallsAndReferencesFailWithActionableErrors() {
        assertThrows(IllegalArgumentException.class, () -> service.execute("binding", new ResourceCall(null, null, null, null, null, null)));
        assertThrows(IllegalArgumentException.class, () -> service.bind("system", null, "db", "", true));
        verify(provider, never()).execute(any(), any());
    }

    private ResourceBinding binding(boolean enabled) { return new ResourceBinding("binding", "system", "sql", "db", "查询", enabled); }
    private ResourceDescriptor resource(String env, List<String> capabilities) { return new ResourceDescriptor("db", "数据库", "MYSQL", env, "localhost:3306", "tester", true, capabilities, ""); }
    private ResourceCall query() { return new ResourceCall("QUERY", "select 1", null, null, null, null); }
}
