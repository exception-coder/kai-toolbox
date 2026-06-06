package com.exceptioncoder.toolbox.common.auth.web;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.MethodParameter;
import org.springframework.core.ResolvableType;
import org.springframework.http.HttpEntity;
import org.springframework.http.MediaType;
import org.springframework.web.method.HandlerMethod;

import java.io.IOException;
import java.util.Collection;

/**
 * 软鉴权未授权时，按 handler 返回类型产出「空数据」响应：
 * 集合/数组 → {@code []}；void → 204；其它对象 → {@code {}}。
 */
final class EmptyResponses {

    private EmptyResponses() {
    }

    static void write(HttpServletResponse response, HandlerMethod handlerMethod) throws IOException {
        Class<?> effective = effectiveReturnType(handlerMethod);
        response.setCharacterEncoding("UTF-8");

        if (effective == void.class || Void.class.equals(effective)) {
            response.setStatus(HttpServletResponse.SC_NO_CONTENT);
            return;
        }
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        if (Collection.class.isAssignableFrom(effective) || effective.isArray()) {
            response.getWriter().write("[]");
        } else {
            response.getWriter().write("{}");
        }
    }

    /** 解析有效返回类型，ResponseEntity/HttpEntity 取其泛型实参。 */
    private static Class<?> effectiveReturnType(HandlerMethod handlerMethod) {
        MethodParameter returnType = handlerMethod.getReturnType();
        Class<?> raw = returnType.getParameterType();
        if (HttpEntity.class.isAssignableFrom(raw)) {
            Class<?> generic = ResolvableType.forMethodParameter(returnType).getGeneric(0).resolve();
            return generic != null ? generic : Object.class;
        }
        return raw;
    }
}
