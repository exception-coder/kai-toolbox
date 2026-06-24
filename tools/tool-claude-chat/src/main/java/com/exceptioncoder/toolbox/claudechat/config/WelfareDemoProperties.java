package com.exceptioncoder.toolbox.claudechat.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 「福利签收演示」约束档，绑定 {@code toolbox.welfare-demo.*}。
 *
 * <p>这是受约束 Vibe coding 演示的服务端单一事实源：免登录访客只能在一份一次性副本里改 welfare-sign
 * 模块——源码克隆到独立目录、数据导入独立 SQLite 库，真实模块与 toolbox.db 零影响。默认关闭，显式开。</p>
 */
@Data
@Component
@ConfigurationProperties(prefix = "toolbox.welfare-demo")
public class WelfareDemoProperties {

    /**
     * 是否开启免登录演示通道。默认开（应 owner 要求）。
     * 注意：开启即允许匿名访客在一次性副本里改 welfare-sign，务必不要把本服务经公网 tunnel 暴露。
     * 需临时关闭可设环境变量 TOOLBOX_WELFARE_DEMO_ENABLED=false。
     */
    private boolean enabled = true;

    /** 克隆来源（相对仓库根，只读复制）。welfare-sign 模块涉及的源码两处。 */
    private List<String> sourcePaths = List.of(
            "tools/tool-welfare-sign",
            "frontend/src/features/welfare-sign");

    /** SQL 表名白名单前缀；demo 库本就只含这些表，是纵深防御的第二闸。 */
    private String allowedTablePrefix = "welfare_sign_";

    /** 单个副本存活时长（分钟），超时回收。 */
    private int ttlMinutes = 30;

    /** 并发副本上限，超过拒绝新建演示，避免磁盘被刷爆。 */
    private int maxConcurrentSandboxes = 5;

    /** 复制时排除的目录名（构建产物 / 依赖）。 */
    private List<String> copyExcludes = List.of("target", "node_modules", "dist", ".git");
}
