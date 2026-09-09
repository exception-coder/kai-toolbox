package com.exceptioncoder.toolbox.common.auth.service;

import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import java.util.HashMap;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CapsuleIdentityTest {
    @Test
    void reusesIdentityButSeparatesClientsAndParticipants() {
        var repository = mock(AuthUserRepository.class);
        var stored = new HashMap<String, AuthUser>();
        when(repository.findByUsername(anyString())).thenAnswer(call -> Optional.ofNullable(stored.get(call.getArgument(0))));
        when(repository.insert(any())).thenAnswer(call -> {
            AuthUser user = call.getArgument(0);
            stored.put(user.getUsername(), user);
            return (long) stored.size();
        });
        var service = new AuthUserService(repository, mock(PasswordHasher.class), new AuthProperties());
        var first = service.resolveClientIdentity("yoooni-one", 12);
        assertThat(service.resolveClientIdentity("yoooni-one", 12).getId()).isEqualTo(first.getId());
        assertThat(service.resolveClientIdentity("erp", 12).getId()).isNotEqualTo(first.getId());
        assertThat(service.resolveClientIdentity("yoooni-one", 13).getId()).isNotEqualTo(first.getId());
        assertThat(first.getRoles()).containsExactly("USER");
        first.setEnabled(false);
        assertThatThrownBy(() -> service.resolveClientIdentity("yoooni-one", 12)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> service.resolveClientIdentity("yoooni-one", 0)).isInstanceOf(IllegalArgumentException.class);
    }
}
