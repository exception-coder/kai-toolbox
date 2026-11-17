package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ConsultLoginRequestTest {
    @Test void onlyRecognizesSameOriginLoginPostsContainingBothExactCredentials() {
        var account = new BrowserLoginTarget("personal", "个人", "TEST", "https://app.test", "alice", "p&a", "username", "password");
        assertTrue(PlaywrightPreviewBrowser.credentialLoginRequest(account, "POST", "https://app.test/api/login", "{\"loginName\":\"alice\",\"pwd\":\"p&a\"}"));
        assertTrue(PlaywrightPreviewBrowser.credentialLoginRequest(account, "POST", "https://app.test/auth/token", "username=alice&password=p%26a"));
        assertFalse(PlaywrightPreviewBrowser.credentialLoginRequest(account, "POST", "https://evil.test/api/login", "username=alice&password=p%26a"));
        assertFalse(PlaywrightPreviewBrowser.credentialLoginRequest(account, "POST", "https://app.test/orders/delete", "username=alice&password=p%26a"));
        assertFalse(PlaywrightPreviewBrowser.credentialLoginRequest(account, "DELETE", "https://app.test/api/login", "username=alice&password=p%26a"));
        assertFalse(PlaywrightPreviewBrowser.credentialLoginRequest(account, "POST", "https://app.test/api/login", "username=alice&password=wrong"));
        assertFalse(PlaywrightPreviewBrowser.credentialLoginRequest(account, "POST", "https://app.test/api/login", "{invalid"));
    }
}
