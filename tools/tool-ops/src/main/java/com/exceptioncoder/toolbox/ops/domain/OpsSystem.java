package com.exceptioncoder.toolbox.ops.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 我负责的一个系统。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OpsSystem {
    private String id;
    private String name;
    private String code;
    private String owner;
    private String description;
    private int sortOrder;
    private long createdAt;
    private long updatedAt;
}
