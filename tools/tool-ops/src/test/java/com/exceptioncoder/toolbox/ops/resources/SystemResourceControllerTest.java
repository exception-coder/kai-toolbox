package com.exceptioncoder.toolbox.ops.resources;

import com.exceptioncoder.toolbox.ops.resources.api.SystemResourceController;
import com.exceptioncoder.toolbox.ops.resources.application.SystemResourceService;
import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import com.exceptioncoder.toolbox.common.resource.SqlWriteAuthorization;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SystemResourceControllerTest {
    @Test void forwardsExplicitWriteDeclarationWithoutChangingQueryContract() throws Exception {
        var service = mock(SystemResourceService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new SystemResourceController(service)).build();
        mvc.perform(post("/api/ops/resources/bindings/bound/execute").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"operation":"EXECUTE","sql":"update orders set status=1 where id=7",
                         "writeAuthorization":{"sessionId":"session","userInstruction":"允许执行测试库更新",
                          "scope":"TEST/orders/id=7","requestId":"2736707c-75c2-4beb-9ba5-31c04edd1531"}}
                        """))
                .andExpect(status().isOk());
        verify(service).execute("bound", new ResourceCall("EXECUTE", "update orders set status=1 where id=7",
                null, null, null, null, new SqlWriteAuthorization("session", "允许执行测试库更新",
                "TEST/orders/id=7", "2736707c-75c2-4beb-9ba5-31c04edd1531")));
    }
    @Test void bindingMutationsReturnNoContentAndUseReferences() throws Exception {
        var service = mock(SystemResourceService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new SystemResourceController(service)).build();
        mvc.perform(put("/api/ops/resources/bindings").contentType(MediaType.APPLICATION_JSON)
                .content("{\"systemId\":\"system\",\"providerId\":\"provider\",\"resourceId\":\"source\",\"purpose\":\"query\",\"enabled\":true}"))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        verify(service).bind("system", "provider", "source", "query", true);
        mvc.perform(delete("/api/ops/resources/bindings/id")).andExpect(status().isNoContent());
        verify(service).unbind("id");
    }

    @Test void discoveryExposesCatalogContractAndSystemScope() throws Exception {
        var service = mock(SystemResourceService.class);
        when(service.catalog()).thenReturn(new SystemResourceService.Catalog(List.of(), List.of(), List.of(), List.of("offline")));
        when(service.discover("system")).thenReturn(List.of());
        var mvc = MockMvcBuilders.standaloneSetup(new SystemResourceController(service)).build();
        mvc.perform(get("/api/ops/resources")).andExpect(status().isOk())
                .andExpect(jsonPath("$.unavailableProviders[0]").value("offline"))
                .andExpect(jsonPath("$.bindings").isArray());
        mvc.perform(get("/api/ops/resources/systems/system")).andExpect(status().isOk()).andExpect(content().json("[]"));
        verify(service).discover("system");
    }
}
