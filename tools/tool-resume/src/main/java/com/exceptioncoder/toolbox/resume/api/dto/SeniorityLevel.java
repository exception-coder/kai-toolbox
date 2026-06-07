package com.exceptioncoder.toolbox.resume.api.dto;

/**
 * 岗位级别。由前端基于工作年限推断后传入，后端 prompt 据此分档写作语气与成果颗粒度。
 * 与前端 optimize/types.ts 的 SeniorityLevel 一一对应。
 */
public enum SeniorityLevel {
    JUNIOR,
    INTERMEDIATE,
    SENIOR,
    EXPERT
}
