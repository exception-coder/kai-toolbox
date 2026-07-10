package com.exceptioncoder.toolbox.common.dynamicconfig.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记一个 {@code @ConfigurationProperties} 配置块纳入运行时动态配置中心：
 * 可在线编辑、不重启生效（SQLite 覆盖 + EnvironmentChangeEvent rebind）、重启保留。
 *
 * <p>配置块的 prefix 复用其 {@code @ConfigurationProperties} 的 prefix，不在此重复声明。
 * 「重启才生效」的配置（端口、线程池等）不要标记本注解。</p>
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Refreshable {

    /** 展示名，用于配置中心 UI。 */
    String name();

    /** 所属分组（配置中心 UI 把同模块的多个配置块收拢到一组下）。留空则不分组、独立展示。 */
    String group() default "";
}
