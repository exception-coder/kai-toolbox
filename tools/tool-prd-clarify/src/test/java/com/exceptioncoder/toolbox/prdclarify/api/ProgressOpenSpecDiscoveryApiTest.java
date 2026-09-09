package com.exceptioncoder.toolbox.prdclarify.api;

import com.exceptioncoder.toolbox.prdclarify.service.OpenSpecProgressContextResolver;
import com.exceptioncoder.toolbox.prdclarify.service.PrdClarifyService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ProgressOpenSpecDiscoveryApiTest {
    @Mock private PrdClarifyService service;
    @InjectMocks private PrdClarifyController controller;

    @Test
    void discoversBySessionWithoutAcceptingClientFilesystemPath() throws Exception {
        when(service.discoverProgressOpenSpec("requirement-1")).thenReturn(
                new OpenSpecProgressContextResolver.Discovery("READY", List.of("add-export"),
                        "add-export", "已自动关联"));
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/prd-clarify/sessions/requirement-1/progress/openspec"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changeIds[0]").value("add-export"))
                .andExpect(jsonPath("$.selectedChange").value("add-export"));
        verify(service).discoverProgressOpenSpec("requirement-1");
    }
}
