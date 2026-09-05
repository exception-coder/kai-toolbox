package com.exceptioncoder.forge.sessionrelay.support;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** 生成并单次消费不含上游凭据的本地 WebSocket ticket。 */
public final class LocalConnectionTicketStore {
    private final Duration ttl;
    private final Map<String, Entry> tickets = new ConcurrentHashMap<>();

    public LocalConnectionTicketStore(Duration ttl) {
        this.ttl = ttl;
    }

    public IssuedTicket issue(ForgeRelayBinding binding) {
        Instant expiresAt = Instant.now().plus(ttl);
        String value = UUID.randomUUID().toString();
        tickets.put(value, new Entry(binding, expiresAt));
        return new IssuedTicket(value, expiresAt);
    }

    public Optional<ForgeRelayBinding> consume(String ticket, long subjectUserId) {
        Entry entry = ticket == null ? null : tickets.remove(ticket);
        if (entry == null || !entry.expiresAt().isAfter(Instant.now())
                || entry.binding().subjectUserId() != subjectUserId) {
            return Optional.empty();
        }
        return Optional.of(entry.binding());
    }

    private record Entry(ForgeRelayBinding binding, Instant expiresAt) { }

    public record IssuedTicket(String ticket, Instant expiresAt) { }
}
