package com.exceptioncoder.toolbox.foreconsult.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 业务系统展示偏好：对应 consult_system_pref 表的一行。
 * 呈现层覆盖（别名 + 是否显示 + 排序），不复制系统字典本身（字典仍来自 claude-chat workspaces）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsultSystemPref {

    private String systemName;
    private String systemSourcePath;
    /** 业务别名，为空则前端回退用原名。 */
    private String alias;
    /** 是否在星图中显示。 */
    private boolean visible;
    /** 排序权重，小的靠前。 */
    private int sortOrder;
    private long updatedAt;
}
