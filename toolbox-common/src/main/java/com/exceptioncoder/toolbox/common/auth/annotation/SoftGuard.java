package com.exceptioncoder.toolbox.common.auth.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 「软鉴权」标记：未持有所需角色时**不报错**，而是按 handler 返回类型返回空数据
 * （List→[]、对象→{}、void→204），写操作因短路而 no-op。
 *
 * <p>与硬鉴权 {@link RequireRole}（不达标 403）相对。持有 value 中任一角色或 {@code ADMIN} 即放行。</p>
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface SoftGuard {

    /** 允许访问的角色集合，命中任一即可（ADMIN 始终放行）。为空表示仅 ADMIN 可访问。 */
    String[] value() default {};

    /**
     * 是否允许全局 READONLY 角色只读访问（安全方法）。默认 true。
     * 设为 false 时 READONLY 也不可读，仅 value 角色 + ADMIN 可访问——用于更私密的模块（如简历）。
     */
    boolean allowReadonly() default true;
}
