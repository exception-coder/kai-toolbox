package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.service.AuthUserService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CapsuleRelayIdentityServiceTest {
    private final CapsuleRelayClientAuthenticator clients = mock(CapsuleRelayClientAuthenticator.class);
    private final AuthUserService users = mock(AuthUserService.class);
    private final ProjectRouteBindingService projects = mock(ProjectRouteBindingService.class);
    private final CapsuleRelayIdentityService identities = new CapsuleRelayIdentityService(clients, users, projects);

    @Test
    void preservesParticipantOwnershipWithoutGrantingAdminPrivileges() {
        when(clients.authenticate("Basic host")).thenReturn("yoooni-one");
        when(users.resolveClientIdentity("yoooni-one", 12))
                .thenReturn(AuthUser.builder().id(101L).username("capsule-user").enabled(true).build());
        var identity = identities.authenticate("Basic host", 12);
        assertThat(identity.projectKey()).isEqualTo("yoooni-one");
        assertThat(identity.principal().userId()).isEqualTo(101L);
        assertThat(identity.principal().roles()).isEmpty();
        assertThat(identity.principal().permissionCodes()).isEmpty();
        verify(projects).resolve("yoooni-one");
        verify(users).resolveClientIdentity("yoooni-one", 12);
    }

    @Test
    void refusesInvalidParticipantsBeforeProvisioning() {
        assertThatThrownBy(() -> identities.authenticate("Basic host", 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> identities.authenticate("Basic host", -1))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(clients, users, projects);
    }

    @Test
    void unboundHostCannotCreateAnIdentity() {
        when(clients.authenticate("Basic host")).thenReturn("unbound");
        when(projects.resolve("unbound")).thenThrow(new IllegalArgumentException("unbound"));
        assertThatThrownBy(() -> identities.authenticate("Basic host", 12))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(users);
    }
}
