package com.exceptioncoder.toolbox.browserrequest.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 编排链 = 有序 Step 列表，整体序列化为 JSON 存到 {@code steps_json} 列。
 * Step 不单独建表——避免孤儿、写入原子、读取一次 SQL。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Pipeline {
    private String id;
    private String sessionId;
    private String name;
    /** Steps 序列化后的 JSON 字符串，结构见 PipelineDtos.StepDto。 */
    private String stepsJson;
    private long createdAt;
    private long updatedAt;
}
