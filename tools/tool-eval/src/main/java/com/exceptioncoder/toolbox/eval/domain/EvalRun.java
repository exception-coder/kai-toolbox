package com.exceptioncoder.toolbox.eval.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 一次评测运行。model / promptKey / promptVersion 三者构成「这批分数是在什么口径下拿到的」，
 * 缺任一项都无法解释两次 run 的差异来自被测系统还是来自配置漂移。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalRun {
    private String id;
    private String scenario;
    private String dataset;
    private String adapter;
    private String model;
    private String promptKey;
    private Integer promptVersion;
    private String status;
    private int total;
    private int passed;
    private int failed;
    private int errored;
    private String note;
    private String error;
    private Long startedAt;
    private Long finishedAt;
}
