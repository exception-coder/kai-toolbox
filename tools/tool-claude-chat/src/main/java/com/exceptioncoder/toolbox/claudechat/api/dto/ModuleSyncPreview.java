package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 「更新项目模块」预览：按代码目录结构重新解析出的候选模块，与知识库 modules.json 现清单的差异。
 * 只读，不写盘；owner 在前端勾选确认后再调 apply（只新增、不删除）。
 *
 * @param project             项目目录名
 * @param projectPath         项目绝对路径
 * @param exists              项目目录是否存在且在配置根内
 * @param knowledgeConfigured 是否已找到该项目的知识库 modules.json（否则无法推导基准，只能走 CLI --code-base）
 * @param knowledgeBaseDir    当前配置的知识库根目录（project-domain-knowledge 的 knowledge/ 目录）；未配置为空串
 * @param knowledgeDirExists  上述知识库根目录在磁盘上是否存在（区分「没配/配错路径」与「该项目还没生成清单」）
 * @param currentCount        现有模块条目数（含子模块）
 * @param added               新增候选：磁盘上有目录、清单里没有的模块（非容器目录）
 * @param missing             已消失：清单里有、磁盘上目录已不存在的模块（仅告警，apply 不删除）
 */
public record ModuleSyncPreview(String project, String projectPath, boolean exists,
                                boolean knowledgeConfigured, String knowledgeBaseDir, boolean knowledgeDirExists,
                                int currentCount, List<Candidate> added, List<Missing> missing) {

    /** @param keyConflict key 与现有条目冲突（apply 时会跳过，需手动改名） */
    public record Candidate(String key, String codePath, boolean keyConflict) {
    }

    public record Missing(String key, String name, String codePath) {
    }
}
