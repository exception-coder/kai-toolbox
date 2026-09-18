package com.exceptioncoder.toolbox.ops.resources.domain;

/** 服务端持有的测试应用连接；密码不得进入 API 视图或资源目录。 */
public record ApplicationResource(String id, String name, String environment, String baseUrl,
                                  AuthType authType, String loginPath, String username, String password,
                                  String usernameField, String passwordField, String tokenJsonPath,
                                  String tenantHeader, String tenantValue, long createdAt, long updatedAt) {
    public enum AuthType { NONE, FORM_COOKIE, JSON_BEARER }

    public boolean hasPassword() { return password != null && !password.isBlank(); }
    public boolean configured() {
        if (baseUrl == null || baseUrl.isBlank()) return false;
        return authType == AuthType.NONE || (username != null && !username.isBlank() && hasPassword()
                && loginPath != null && !loginPath.isBlank());
    }
}
