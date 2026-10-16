package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.service.*;
import com.exceptioncoder.toolbox.common.auth.web.*;
import com.exceptioncoder.toolbox.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import java.util.Map;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ConsultSessionListTest {
    private final ConsultService service = mock(ConsultService.class);
    private final ConsultController controller = new ConsultController(service,
            mock(TurnBugExtractionService.class), mock(ConsultQuestionClassifier.class),
            mock(ConsultDispatchService.class), mock(CodexHomeDiscoveryService.class),
            mock(BusinessConsultModelPolicyService.class));

    @Test
    void listsLegacySessionsWithUnknownCreatorWithoutDroppingThemOrInventingAnOwner() throws Exception {
        when(service.listRecent(50)).thenReturn(List.of(ConsultSession.builder().sessionId("legacy")
                .systemName("ERP").devSessionId("original-runtime").archiveStatus("PENDING").build()));
        when(service.creatorNames(any())).thenReturn(Map.of());
        when(service.turnCounts(any())).thenReturn(Map.of("legacy", 2));
        var mvc = MockMvcBuilders.standaloneSetup(controller).addInterceptors(new RequireAuthInterceptor())
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        try {
            mvc.perform(get("/api/fore-consult/sessions")).andExpect(status().isUnauthorized());
            AuthContext.set(new AuthPrincipal(1, "admin", List.of("ADMIN"), List.of(), "j", 0));
            mvc.perform(get("/api/fore-consult/sessions")).andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].sessionId").value("legacy"))
                    .andExpect(jsonPath("$[0].devSessionId").value("original-runtime"))
                    .andExpect(jsonPath("$[0].creatorName").doesNotExist())
                    .andExpect(jsonPath("$[0].archiveStatus").value("PENDING"))
                    .andExpect(jsonPath("$[0].turnCount").value(2));
        } finally {
            AuthContext.clear();
        }
    }
}
