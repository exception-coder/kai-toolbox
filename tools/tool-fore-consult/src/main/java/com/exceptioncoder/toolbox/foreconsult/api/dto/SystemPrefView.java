package com.exceptioncoder.toolbox.foreconsult.api.dto;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSystemPref;

/**
 * 业务系统展示偏好的前端视图（只读）。
 *
 * @param systemName       系统原名（身份键）
 * @param systemSourcePath 源码路径快照
 * @param alias            业务别名（可为 null，前端回退用原名）
 * @param visible          是否显示
 * @param sortOrder        排序权重（小的靠前）
 */
public record SystemPrefView(
        String systemName,
        String systemSourcePath,
        String alias,
        boolean visible,
        int sortOrder
) {

    public static SystemPrefView from(ConsultSystemPref p) {
        return new SystemPrefView(p.getSystemName(), p.getSystemSourcePath(), p.getAlias(), p.isVisible(), p.getSortOrder());
    }
}
