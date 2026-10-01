package com.exceptioncoder.toolbox.common.git;

import java.util.List;

/** 推送目标公开快照，远端地址已脱敏。 */
public record GitPushPreview(/** 本地分支。 */ String branch, /** 固定提交。 */ String head,
                             /** 远端名称。 */ String remote, /** 目标分支。 */ String targetBranch,
                             /** 脱敏地址。 */ List<String> destinations,
                             /** 领先数。 */ Integer ahead, /** 落后数。 */ Integer behind,
                             /** 阻断原因。 */ String pushBlockedReason,
                             /** 快照指纹。 */ String token) { }
