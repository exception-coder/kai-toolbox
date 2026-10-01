package com.exceptioncoder.toolbox.common.git;

import java.nio.file.Path;

/** 共享快照推送端口；调用方解析并授权仓库身份，提供方执行统一推送规则。 */
public interface GitPushOperations {
    /** @return 当前提交与脱敏远端目标的推送快照 */
    GitPushPreview preview(Path repository);
    /** @return 固定快照的真实推送结果；过期或不合格快照明确拒绝 */
    String push(Path repository, String token);
}
