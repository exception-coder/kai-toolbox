package com.exceptioncoder.forge.mobile;

/** Run without Android SDK: protects the origin boundary, not WebView runtime behavior. */
public final class OriginPolicyTest {
    public static void main(String[] args) {
        String expected = "https://forge.example.com";
        for (String allowed : new String[]{expected, expected + "/tools/claude-chat?session=1", "https://forge.example.com:443/", "https://FORGE.example.com/"}) {
            if (!OriginPolicy.trusted(expected, allowed)) { throw new AssertionError("Rejected trusted origin"); }
        }
        for (String rejected : new String[]{"http://forge.example.com", "https://forge.example.com.evil.test/", "https://forge.example.com@evil.test/", "https://user@forge.example.com/", "https://forge.example.com:444/", "file:///forge.example.com", "javascript:alert(1)", "about:blank", "https://evil.test/#https://forge.example.com", "https://forge.example.com%2fevil.test/"}) {
            if (OriginPolicy.trusted(expected, rejected)) { throw new AssertionError("Accepted untrusted origin"); }
        }
        for (String path : new String[]{"/api/attachments/user.html", "/api/preview", "/tools/../api/file", "/tools/%2e%2e/api/file"}) {
            if (OriginPolicy.workspace(expected, expected + path)) { throw new AssertionError("Accepted non-workspace content"); }
        }
        if (!OriginPolicy.workspace(expected, expected + "/tools/claude-chat")) { throw new AssertionError("Workspace was rejected"); }
        System.out.println("Origin policy: 4 trusted, 10 hostile origins and 5 workspace boundaries passed; Android runtime not executed.");
    }
}
