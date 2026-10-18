package com.exceptioncoder.toolbox.common.resource;

import com.fasterxml.jackson.annotation.JsonIgnore;

/** 引用既有资源的网页登录信息，密码不参与序列化或字符串输出。 */
public record BrowserLoginTarget(String id, String name, String environment, String baseUrl,
                                 String username, @JsonIgnore String password,
                                 String usernameField, String passwordField) {
    @Override
    public String toString() {
        return "BrowserLoginTarget[id=" + id + ", environment=" + environment + "]";
    }
}
