package com.exceptioncoder.toolbox.common.git;

/** 已检查的上游版本与拉取条件，不包含连接凭据。 */
public record GitPullPreview(
        /** 当前分支。 */ String branch,
        /** 本地提交。 */ String head,
        /** 远端名称。 */ String remote,
        /** 上游分支。 */ String targetBranch,
        /** 脱敏读取地址。 */ String source,
        /** 已获取的上游提交。 */ String upstreamHead,
        /** 本地领先数。 */ Integer ahead,
        /** 待拉取数。 */ Integer behind,
        /** 阻断原因，空表示可执行。 */ String pullBlockedReason,
        /** 固定版本及配置指纹。 */ String token) { }
