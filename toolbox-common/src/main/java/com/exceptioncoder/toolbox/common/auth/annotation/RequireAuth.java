package com.exceptioncoder.toolbox.common.auth.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记需要登录才能访问的 Controller 方法或类。由 RequireAuthInterceptor 在 MVC 阶段强制。
 * 与路径级 protected-patterns 解耦：工具可只用注解做方法级控制。
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireAuth {
}
