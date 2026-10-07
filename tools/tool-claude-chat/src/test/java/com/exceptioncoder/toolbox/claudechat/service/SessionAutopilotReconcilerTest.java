package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;

class SessionAutopilotReconcilerTest {
    @Test
    void scheduledRecoveryWaitsForSchemaMigrationsAndApplicationReady() {
        var service = mock(SessionAutopilotService.class);
        var reconciler = new SessionAutopilotReconciler(service);
        reconciler.reconcile();
        verifyNoInteractions(service);
        reconciler.onReady();
        reconciler.reconcile();
        verify(service, times(2)).reconcileActiveRuns();
    }
}
