package com.exceptioncoder.toolbox.common.git;

import java.nio.file.Path;

/** 拉取端口；调用方授权仓库，提供方检查上游并执行固定版本快进。 */
public interface GitPullOperations {
    /** @return fetch 后的脱敏快照；不修改工作树 */
    GitPullPreview prepare(Path repository);

    /** @return 固定快照快进的实际结果；不自动处理脏文件或分叉 */
    String pull(Path repository, String token);
}
