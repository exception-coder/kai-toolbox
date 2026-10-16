package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.dynamicconfig.service.DynamicConfigService;
import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader;
import com.exceptioncoder.toolbox.common.auth.web.*;
import com.exceptioncoder.toolbox.common.exception.GlobalExceptionHandler;
import com.exceptioncoder.toolbox.foreconsult.api.ConsultAttachmentController;
import com.exceptioncoder.toolbox.foreconsult.config.ConsultAttachmentProperties;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import org.springframework.boot.autoconfigure.web.servlet.MultipartProperties;
import org.springframework.util.unit.DataSize;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ConsultAttachmentPolicyTest {
    @Test void validatesLimitsAndUsesCurrentPolicyOnlyForConsultations() {
        var properties = new ConsultAttachmentProperties();
        var config = mock(DynamicConfigService.class);
        var sessions = mock(ConsultSessionRepository.class);
        when(sessions.findByDevSessionId("consult")).thenReturn(Optional.of(ConsultSession.builder().build()));
        var transport = new MultipartProperties(); transport.setMaxFileSize(DataSize.ofMegabytes(200)); transport.setMaxRequestSize(DataSize.ofMegabytes(210));
        var service = new ConsultAttachmentPolicyService(properties, config, transport, sessions);
        assertThat(service.uploadLimit("consult").orElseThrow()).isEqualTo(100L * 1024 * 1024);
        assertThat(service.uploadLimit("coding")).isEmpty();
        properties.setUploadMaxMb(150); properties.setReadMaxMb(120);
        assertThat(service.get().effectiveReadBytes()).isEqualTo(120L * 1024 * 1024);
        assertThat(service.uploadLimit("consult").orElseThrow()).isEqualTo(150L * 1024 * 1024);
        for (int[] pair : new int[][]{{0,1},{201,1},{50,51},{50,0}}) {
            assertThatThrownBy(() -> service.save(pair[0], pair[1])).isInstanceOf(IllegalArgumentException.class);
        }
        verifyNoInteractions(config);
        service.save(150, 100);
        verify(config).applyOverrides(eq(ConsultAttachmentProperties.PREFIX), argThat(values -> values.get(ConsultAttachmentProperties.PREFIX + ".read-max-mb").equals("100")), eq(List.of()));
        transport.setMaxFileSize(DataSize.ofMegabytes(60));
        assertThat(service.get().effectiveUploadBytes()).isEqualTo(60L * 1024 * 1024);
        assertThatThrownBy(() -> service.save(100, 50)).hasMessageContaining("部署");
    }

    @Test void enforcesUserAdminAndSignedSessionBoundaries() throws Exception {
        var policy = mock(ConsultAttachmentPolicyService.class);
        when(policy.get()).thenReturn(new ConsultAttachmentPolicyService.View(100,50,104857600,52428800,209715200,10));
        var sessions = mock(ConsultSessionRepository.class);
        when(sessions.findByDevSessionId("runtime")).thenReturn(Optional.of(ConsultSession.builder().build()));
        var reader = mock(SessionAttachmentReader.class); var access = new ConsultResourceAccess();
        var mvc = MockMvcBuilders.standaloneSetup(new ConsultAttachmentController(policy,access,sessions,reader))
                .addInterceptors(new RequireAuthInterceptor()).setControllerAdvice(new GlobalExceptionHandler()).build();
        try {
            mvc.perform(get("/api/fore-consult/attachments/policy")).andExpect(status().isUnauthorized());
            AuthContext.set(new AuthPrincipal(1,"biz",List.of("USER"),List.of(),"j",0));
            mvc.perform(get("/api/fore-consult/attachments/policy")).andExpect(status().isOk());
            mvc.perform(put("/api/fore-consult/attachments/policy").contentType("application/json").content("{\"uploadMaxMb\":100,\"readMaxMb\":50}")).andExpect(status().isForbidden());
            verify(policy, never()).save(anyInt(),anyInt());
            AuthContext.set(new AuthPrincipal(1,"admin",List.of("ADMIN"),List.of(),"j",0));
            mvc.perform(put("/api/fore-consult/attachments/policy").contentType("application/json").content("{\"uploadMaxMb\":100,\"readMaxMb\":50}")).andExpect(status().isOk());
            verify(policy).save(100,50);
            AuthContext.clear();
            mvc.perform(post("/api/fore-consult/attachments/sessions/runtime/read").contentType("application/json").content("{\"path\":\"file.html\"}")).andExpect(status().isForbidden());
            mvc.perform(post("/api/fore-consult/attachments/sessions/runtime/read").header("X-Consult-Resource-Token",access.issue("runtime")).contentType("application/json").content("{\"path\":\"file.html\"}")).andExpect(status().isOk());
            verify(reader).readContent("runtime",52428800,
                    new SessionAttachmentReader.Request("file.html", null, null, null, null, null));
            var workbookRequest = new SessionAttachmentReader.Request("stock.xlsx", null, null, "款号库存", 501, 100);
            when(reader.readContent("runtime", 52428800, workbookRequest)).thenReturn(
                    new SessionAttachmentReader.WorkbookPage("workbook", "stock.xlsx", 2000,
                            List.of(new SessionAttachmentReader.SheetInfo("款号库存", "visible")),
                            "款号库存", 2219, 501, 601, false, List.of(), "不执行公式"));
            mvc.perform(post("/api/fore-consult/attachments/sessions/runtime/read")
                    .header("X-Consult-Resource-Token",access.issue("runtime"))
                    .contentType("application/json")
                    .content("{\"path\":\"stock.xlsx\",\"sheet\":\"款号库存\",\"startRow\":501,\"maxRows\":100}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.kind").value("workbook"))
                    .andExpect(jsonPath("$.nextRow").value(601));
            verify(reader).readContent("runtime",52428800,
                    new SessionAttachmentReader.Request("stock.xlsx", null, null, "款号库存", 501, 100));
        } finally { AuthContext.clear(); }
    }
}
