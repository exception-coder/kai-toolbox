package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/** 固定团队 Skill 从源码同步到各 Agent 当前插件缓存后的结果。 */
public record SkillSyncResultView(
        String skill,
        String sourcePath,
        String sourceSha256,
        List<TargetView> targets) {

    public record TargetView(
            String agent,
            String version,
            String targetPath,
            String status,
            String message) {
    }
}
