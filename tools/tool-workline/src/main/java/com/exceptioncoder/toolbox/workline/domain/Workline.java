package com.exceptioncoder.toolbox.workline.domain;

import lombok.Builder;
import lombok.Data;

/**
 * 工作线：一条工作主线（如某项目 / 某方向），其下挂多条 {@link WorklineEntry}。
 */
@Data
@Builder
public class Workline {
    private Long id;
    private String name;
    private String description;
    private int sortOrder;
    private long createdAt;
    private long updatedAt;
}
