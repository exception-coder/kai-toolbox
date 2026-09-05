package com.exceptioncoder.forge.sessionrelay.support;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import com.exceptioncoder.forge.sessionrelay.ForgeRelayBindingStore;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** 有界开发期 Store；生产宿主应覆盖为加密持久化实现。 */
public final class InMemoryForgeRelayBindingStore implements ForgeRelayBindingStore {
    private final int capacity;
    private final Map<Long, ForgeRelayBinding> bindings;

    public InMemoryForgeRelayBindingStore(int capacity) {
        this.capacity = capacity;
        this.bindings = new LinkedHashMap<>();
    }

    @Override
    public synchronized void save(ForgeRelayBinding binding) {
        bindings.remove(binding.subjectUserId());
        bindings.put(binding.subjectUserId(), binding);
        while (bindings.size() > capacity) {
            bindings.remove(bindings.keySet().iterator().next());
        }
    }

    @Override
    public synchronized Optional<ForgeRelayBinding> find(long subjectUserId) {
        ForgeRelayBinding binding = bindings.get(subjectUserId);
        if (binding != null && binding.expiresAt().isAfter(Instant.now())) {
            return Optional.of(binding);
        }
        bindings.remove(subjectUserId);
        return Optional.empty();
    }

    @Override
    public synchronized void remove(long subjectUserId) {
        bindings.remove(subjectUserId);
    }
}
