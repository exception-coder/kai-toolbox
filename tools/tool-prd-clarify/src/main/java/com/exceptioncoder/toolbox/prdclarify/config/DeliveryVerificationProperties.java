package com.exceptioncoder.toolbox.prdclarify.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Delivery 手动验证命令白名单。
 *
 * @param commands 受信任命令定义
 */
@ConfigurationProperties(prefix = "toolbox.prd-clarify.delivery-verification")
public record DeliveryVerificationProperties(List<Command> commands) {

    public DeliveryVerificationProperties {
        commands = commands == null ? List.of() : List.copyOf(commands);
    }

    /**
     * 一条只能由服务端配置提供的命令。
     *
     * @param id 对外稳定 ID
     * @param label 用户可读名称
     * @param argv 显式进程参数，不经过 shell 拼接
     * @param timeoutSeconds 超时秒数
     */
    public record Command(String id, String label, List<String> argv, int timeoutSeconds) {

        public Command {
            argv = argv == null ? List.of() : List.copyOf(argv);
        }
    }
}
