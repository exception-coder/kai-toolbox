package com.exceptioncoder.toolbox.resume.api.dto;

/**
 * 简历优化的目标段类型。与前端 optimize/types.ts 的 SectionType 字符串一一对应。
 *
 * <ul>
 *     <li>{@link #WORK} / {@link #PROJECT}：originalContent 为结构化 JSON 字符串</li>
 *     <li>{@link #SELF_INTRO}：originalContent 为纯文本</li>
 * </ul>
 */
public enum SectionType {
    WORK,
    PROJECT,
    SELF_INTRO
}
