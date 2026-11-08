package com.exceptioncoder.forge.mobile;

import java.net.URI;

/** Full origin equality, including effective port; lookalike domains and user-info are never trusted. */
final class OriginPolicy {
    private OriginPolicy() { }

    static boolean trusted(String expected, String candidate) {
        try {
            URI allowed = URI.create(expected);
            URI actual = URI.create(candidate);
            return "https".equalsIgnoreCase(actual.getScheme()) && "https".equalsIgnoreCase(allowed.getScheme())
                && actual.getRawUserInfo() == null && actual.getHost() != null && allowed.getHost() != null
                && allowed.getHost().equalsIgnoreCase(actual.getHost()) && port(allowed) == port(actual);
        } catch (IllegalArgumentException error) { return false; }
    }

    private static int port(URI value) { return value.getPort() == -1 ? 443 : value.getPort(); }

    static boolean workspace(String expected, String candidate) {
        if (!trusted(expected, candidate)) { return false; }
        String path = URI.create(candidate).getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) { return true; }
        return path.startsWith("/tools/") && !path.contains("/../") && !path.contains("/./") && !path.contains("\\");
    }
}
