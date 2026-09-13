package com.exceptioncoder.toolbox.projects.registry.domain;

import com.exceptioncoder.toolbox.common.git.GitStatusEntry;
import java.util.List;

/** 项目 Git 工作区快照；远端计数基于本地跟踪引用。 */
public record ProjectGitWorkspace(
        /** 当前分支，detached 时为空。 */ String branch,
        /** 当前提交，空仓库时为空。 */ String head,
        /** 上游引用。 */ String upstream,
        /** 推送远端名称。 */ String remote,
        /** 远端目标分支。 */ String targetBranch,
        /** 脱敏后的各推送地址。 */ List<String> destinations,
        /** 领先提交数；无法比较时为 null。 */ Integer ahead,
        /** 落后提交数；无法比较时为 null。 */ Integer behind,
        /** 工作区文件。 */ List<GitStatusEntry> files,
        /** 有界待推送提交列表。 */ List<OutgoingCommit> commits,
        /** 不满足推送条件的原因；空串表示可推送。 */ String pushBlockedReason,
        /** 绑定提交和目标的不可逆快照标识。 */ String token) {

    /** 待推送提交摘要。 */
    public record OutgoingCommit(
            /** 完整提交标识。 */ String hash,
            /** 作者。 */ String author,
            /** ISO 提交时间。 */ String date,
            /** 提交标题。 */ String subject) { }
}
