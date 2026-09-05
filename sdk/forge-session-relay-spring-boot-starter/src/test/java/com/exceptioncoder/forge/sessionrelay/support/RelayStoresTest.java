package com.exceptioncoder.forge.sessionrelay.support;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RelayStoresTest {
    @Test
    void bindingStoreIsBoundedAndIsolatedBySubject() {
        InMemoryForgeRelayBindingStore store = new InMemoryForgeRelayBindingStore(1);
        store.save(binding(11));
        store.save(binding(22));

        assertThat(store.find(11)).isEmpty();
        assertThat(store.find(22)).isPresent();
    }

    @Test
    void localTicketIsSingleUseAndSubjectBound() {
        LocalConnectionTicketStore store = new LocalConnectionTicketStore(Duration.ofSeconds(30));
        ForgeRelayBinding binding = binding(11);
        LocalConnectionTicketStore.IssuedTicket ticket = store.issue(binding);

        assertThat(store.consume(ticket.ticket(), 22)).isEmpty();
        assertThat(store.consume(ticket.ticket(), 11)).isEmpty();

        LocalConnectionTicketStore.IssuedTicket valid = store.issue(binding);
        assertThat(store.consume(valid.ticket(), 11)).contains(binding);
        assertThat(store.consume(valid.ticket(), 11)).isEmpty();
    }

    private static ForgeRelayBinding binding(long subject) {
        return new ForgeRelayBinding(subject, "server-only-token", Instant.now().plusSeconds(60),
                "grant-" + subject, "session-" + subject);
    }
}
