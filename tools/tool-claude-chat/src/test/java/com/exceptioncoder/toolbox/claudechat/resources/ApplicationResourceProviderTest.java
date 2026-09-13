package com.exceptioncoder.toolbox.claudechat.resources;

import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ApplicationResourceProviderTest {
    @Test void directoryRemovesUrlCredentialsQueryAndFragment() {
        var provider = new ApplicationResourceProvider("app", () -> new ApplicationResourceProvider.Connection(
                "https://user:secret@localhost:8080/app?token=secret#secret", "tester", true, true),
                () -> null, call -> "ok");
        var resource = provider.resources().getFirst();
        assertEquals("https://localhost:8080/app", resource.endpoint());
        assertFalse(resource.toString().contains("secret"));
        assertTrue(resource.credentialConfigured());
    }

    @Test void missingConfigurationAdvertisesNoExecution() {
        var provider = new ApplicationResourceProvider("app", () -> null, () -> null, call -> "ok");
        assertTrue(provider.resources().getFirst().capabilities().isEmpty());
        assertThrows(IllegalArgumentException.class, () -> provider.execute("other", new ResourceCall("TEST", null, null, null, null, null)));
    }
}
