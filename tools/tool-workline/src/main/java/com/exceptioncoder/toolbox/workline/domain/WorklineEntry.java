package com.exceptioncoder.toolbox.workline.domain;

import lombok.Builder;
import lombok.Data;

/**
 * 工作条目：记录一次工作的核心内容（coreContent）与作出的成果（achievement），归属于一条工作线。
 */
@Data
@Builder
public class WorklineEntry {
    private Long id;
    private Long lineId;
    /** 父条目 id；null = 顶层摘要条目，非空 = 明细子条目 */
    private Long parentId;
    private String title;
    private String coreContent;
    private String achievement;
    private int sortOrder;
    private long createdAt;
    private long updatedAt;
}
