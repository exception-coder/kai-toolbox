package com.exceptioncoder.toolbox.browserrequest.domain;

import java.util.List;

/**
 * Task 的一个步骤。fromCallId 与 adhoc 二选一：
 *   - fromCallId：从录制里引用一条 call（保存时会把 call 的 method/url/headers/body 嵌入 adhoc 字段做副本，避免录制被删后 step 失效）
 *   - adhoc：用户手写的请求模板
 *
 * parameterizations：把 adhoc 内的某段子串替换为 ${varName}
 * extracts：从响应里抽取并命名，供下游 step 用 ${name} 引用
 * continueOnError：本 step 失败是否继续后续 step（缺省为 task 级配置）
 */
public record StepSpec(
        String name,
        String fromCallId,
        AdhocRequest adhoc,
        List<ParameterizationSpec> parameterizations,
        List<ExtractSpec> extracts,
        Boolean continueOnError
) {
    public StepSpec withAdhoc(AdhocRequest a) {
        return new StepSpec(name, fromCallId, a, parameterizations, extracts, continueOnError);
    }
}
