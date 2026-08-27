package com.exceptioncoder.toolbox.common.scheduling;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declares human-readable metadata for a native Spring scheduled method.
 * The scheduling behavior remains controlled exclusively by {@code @Scheduled}.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ScheduledTaskInfo {
    String name();
    String description();
    String owner() default "";
}
