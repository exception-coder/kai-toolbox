package com.exceptioncoder.toolbox.common.git;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 共享 git 查询配置（{@code toolbox.git.*}）。供任意工具复用 {@link GitLogService}。
 */
@Component
@ConfigurationProperties(prefix = "toolbox.git")
@Getter
@Setter
public class GitProperties {

    /** git 可执行（默认走 PATH 的 git；本机非 PATH 安装时填绝对路径） */
    private String binary = "git";

    /** 「提交记录」默认拉取条数 */
    private int commitLimitDefault = 30;

    /** 「提交记录」单次拉取条数上限 */
    private int commitLimitMax = 100;

    /** 单条 diff 输出字节上限，超出截断 */
    private int diffMaxBytes = 1024 * 1024;

    /** git 子进程超时（毫秒） */
    private int timeoutMs = 5000;
}
