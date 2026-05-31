package com.exceptioncoder.toolbox.browserrequest.domain;

/**
 * 从某 step 的响应里抽取一个值，命名后存入 task_run.outputs；
 * 下游 step 可在 ParameterizationSpec.varName 中引用这个名字。
 */
public record ExtractSpec(
        String name,
        String jsonPath
) {
}
