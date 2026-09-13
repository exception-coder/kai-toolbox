package com.exceptioncoder.toolbox.ops.resources;

import com.exceptioncoder.toolbox.common.resource.*;
import com.exceptioncoder.toolbox.ops.resources.application.*;
import com.exceptioncoder.toolbox.ops.resources.domain.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReadonlyResourceServiceTest {
    @Test void enforcesSelectionSystemEnvironmentAndOperation() {
        var provider = mock(ResourceProvider.class);
        var store = mock(ResourceBindingStore.class);
        when(provider.id()).thenReturn("sql");
        when(provider.resources()).thenReturn(List.of(resource("TEST")));
        when(store.list()).thenReturn(List.of(new ResourceBinding("binding", "system", "sql", "db", "查询", true)));
        List<ProjectSystemDirectory> directories = List.of(() -> List.of(
                new ProjectSystemDirectory.SystemIdentity("system", "系统", "/projects/one"),
                new ProjectSystemDirectory.SystemIdentity("other", "其他", "/projects/two")));
        var service = new ReadonlyResourceService(new SystemResourceService(List.of(provider), directories, store), directories);
        when(provider.execute(eq("db"), any())).thenReturn("result");
        assertEquals("result", service.query("/projects/one", List.of("binding"), "binding", "select 1"));
        verify(provider).execute("db", new ResourceCall("QUERY", "select 1", null, null, null, null));
        assertThrows(IllegalArgumentException.class, () -> service.query("/projects/two", List.of("binding"), "binding", "select 1"));
        assertThrows(IllegalArgumentException.class, () -> service.query("/projects/one", List.of(), "binding", "select 1"));
        assertThrows(IllegalArgumentException.class, () -> service.discover("/projects/one/child", List.of("binding")));
        when(provider.resources()).thenReturn(List.of(resource("PROD")));
        assertThrows(IllegalArgumentException.class, () -> service.query("/projects/one", List.of("binding"), "binding", "select 1"));
        when(provider.resources()).thenReturn(List.of());
        assertEquals("UNAVAILABLE", service.discover("/projects/one", List.of("binding")).getFirst().state());
        assertThrows(IllegalArgumentException.class, () -> service.query("/projects/one", List.of("binding"), "binding", "select 1"));
        when(store.list()).thenReturn(List.of());
        assertThrows(IllegalArgumentException.class, () -> service.query("/projects/one", List.of("binding"), "binding", "select 1"));
        verify(provider, times(1)).execute(any(), any());
    }

    @Test void rejectsAmbiguousSystemPath() {
        var service = new ReadonlyResourceService(mock(SystemResourceService.class), List.of(() -> List.of(
                new ProjectSystemDirectory.SystemIdentity("one", "一", "/source"),
                new ProjectSystemDirectory.SystemIdentity("two", "二", "/source"))));
        assertThrows(IllegalArgumentException.class, () -> service.discover("/source", List.of()));
    }
    private ResourceDescriptor resource(String environment) {
        return new ResourceDescriptor("db", "数据库", "MYSQL", environment, "localhost", "account", true, List.of("QUERY"), "");
    }
}
