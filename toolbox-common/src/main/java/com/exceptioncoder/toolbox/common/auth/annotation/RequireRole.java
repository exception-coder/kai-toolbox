package com.exceptioncoder.toolbox.common.auth.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记需要指定角色才能访问。隐含需要登录。当前用户持有 value 中任一角色即放行（OR 语义）。
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireRole {

    /** 允许访问的角色集合，命中任一即可。 */
    String[] value();
}
