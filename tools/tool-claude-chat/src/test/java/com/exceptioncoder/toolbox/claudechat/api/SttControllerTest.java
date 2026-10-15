package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.SttService;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.auth.web.RequireAuthInterceptor;
import com.exceptioncoder.toolbox.common.exception.GlobalExceptionHandler;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SttControllerTest {
    private final SttService speech = mock(SttService.class);
    private final org.springframework.test.web.servlet.MockMvc mvc = MockMvcBuilders
            .standaloneSetup(new SttController(speech)).addInterceptors(new RequireAuthInterceptor())
            .setControllerAdvice(new GlobalExceptionHandler()).build();

    @AfterEach void clearIdentity() { AuthContext.clear(); }

    @Test void businessUserCanTranscribeWithoutAdministratorRole() throws Exception {
        AuthContext.set(new AuthPrincipal(7L, "business", List.of("USER"), List.of(), "test", Long.MAX_VALUE));
        when(speech.isAvailable()).thenReturn(true);
        when(speech.transcribe(any(), eq("auto"))).thenReturn("查询采购进度");
        mvc.perform(get("/api/fore-consult/stt/available")).andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true));
        mvc.perform(post("/api/fore-consult/stt").contentType("audio/webm").content(new byte[]{1}))
                .andExpect(status().isOk()).andExpect(jsonPath("$.text").value("查询采购进度"));
        verify(speech).transcribe(any(), eq("auto"));
    }

    @Test void anonymousUserCannotProbeOrUploadSpeech() throws Exception {
        mvc.perform(get("/api/fore-consult/stt/available")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/fore-consult/stt").content(new byte[]{1})).andExpect(status().isUnauthorized());
        verifyNoInteractions(speech);
    }
}
