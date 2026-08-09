package com.exceptioncoder.toolbox.quicklaunch.service;

import com.exceptioncoder.toolbox.quicklaunch.api.dto.QuickSiteUpsertRequest;
import com.exceptioncoder.toolbox.quicklaunch.domain.OpenMode;
import com.exceptioncoder.toolbox.quicklaunch.domain.QuickSite;
import com.exceptioncoder.toolbox.quicklaunch.domain.WindowBehavior;
import com.exceptioncoder.toolbox.quicklaunch.repository.QuickSiteRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class QuickLaunchServiceTest {

    @Mock
    private QuickSiteRepository repository;

    @Test
    void createAppliesDefaultsAndAllowsLocalhost() {
        QuickLaunchService service = new QuickLaunchService(repository);
        service.create(new QuickSiteUpsertRequest(
                "Forge 前端", "http://localhost:5173", null, null,
                null, null, null, null, null, null, null));

        ArgumentCaptor<QuickSite> captor = ArgumentCaptor.forClass(QuickSite.class);
        verify(repository).insert(captor.capture());
        assertThat(captor.getValue().groupName()).isEqualTo(QuickLaunchService.DEFAULT_GROUP);
        assertThat(captor.getValue().openMode()).isEqualTo(OpenMode.POPUP);
        assertThat(captor.getValue().windowBehavior()).isEqualTo(WindowBehavior.STANDARD);
        assertThat(captor.getValue().enabled()).isTrue();
    }

    @Test
    void rejectsUnsafeSchemesAndEmbeddedCredentials() {
        assertThatThrownBy(() -> QuickLaunchService.validateUrl("javascript:alert(1)"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> QuickLaunchService.validateUrl("https://user:secret@example.com"))
                .isInstanceOf(ResponseStatusException.class);
    }
}
