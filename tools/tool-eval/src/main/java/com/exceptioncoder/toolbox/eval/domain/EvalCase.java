package com.exceptioncoder.toolbox.eval.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 黄金集用例。{@code inputJson} / {@code expectedJson} / {@code assertJson} 均为 JSON 文本，
 * 由 L1 适配层与 L2 断言层解释，L0 不理解其内容。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalCase {
    private String id;
    private String scenario;
    private String dataset;
    private String title;
    private String inputJson;
    private String expectedJson;
    private String assertJson;
    private String tags;
    private String sourceRef;
    private boolean enabled;
    private Long createdAt;
    private Long updatedAt;
}
