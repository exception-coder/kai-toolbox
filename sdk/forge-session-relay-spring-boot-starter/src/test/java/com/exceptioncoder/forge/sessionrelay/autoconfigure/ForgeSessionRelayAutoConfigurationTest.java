package com.exceptioncoder.forge.sessionrelay.autoconfigure;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBindingStore;
import com.exceptioncoder.forge.sessionrelay.ForgeRelayParticipantResolver;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class ForgeSessionRelayAutoConfigurationTest {
    private final WebApplicationContextRunner runner = new WebApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(ForgeSessionRelayAutoConfiguration.class));

    @Test
    void staysInertByDefault() {
        runner.run(context -> assertThat(context).doesNotHaveBean(ForgeRelayBindingStore.class));
    }

    @Test
    void requiresHostParticipantResolver() {
        runner.withPropertyValues("forge.session-relay.enabled=true",
                        "forge.session-relay.client-id=test", "forge.session-relay.client-secret=secret")
                .run(context -> assertThat(context).doesNotHaveBean(ForgeRelayBindingStore.class));
    }

    @Test
    void backsOffWhenHostSuppliesBindingStore() {
        runner.withPropertyValues("forge.session-relay.enabled=true",
                        "forge.session-relay.client-id=test", "forge.session-relay.client-secret=secret")
                .withBean(ForgeRelayParticipantResolver.class, () -> (principal, headers) -> 7L)
                .withBean(ForgeRelayBindingStore.class, TestStore::new)
                .run(context -> assertThat(context.getBeansOfType(ForgeRelayBindingStore.class))
                        .hasSize(1));
    }

    static final class TestStore implements ForgeRelayBindingStore {
        public void save(com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding binding) { }
        public java.util.Optional<com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding> find(long subject) {
            return java.util.Optional.empty();
        }
        public void remove(long subject) { }
    }
}
