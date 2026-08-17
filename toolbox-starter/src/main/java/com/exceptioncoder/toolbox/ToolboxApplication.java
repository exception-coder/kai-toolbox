package com.exceptioncoder.toolbox;

import com.exceptioncoder.toolbox.system.RestartHandoff;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication(scanBasePackages = "com.exceptioncoder.toolbox", exclude = {
        HibernateJpaAutoConfiguration.class,
        JpaRepositoriesAutoConfiguration.class
})
@ConfigurationPropertiesScan(basePackages = "com.exceptioncoder.toolbox")
public class ToolboxApplication {

    public static void main(String[] args) {
        String[] applicationArgs;
        try {
            // replacement JVM 会在这里（Spring/端口/sidecar 尚未初始化）完成接管等待握手，
            // 这只证明候选 JVM 可执行且能等待旧进程，并不宣称运行期健康；
            // 并等待旧 JVM 退出，避免两个实例争抢同一批本机资源。
            applicationArgs = RestartHandoff.awaitParentAndStrip(args);
        } catch (Exception e) {
            System.err.println("[restart-handoff] replacement JVM handoff failed: " + e.getMessage());
            return;
        }
        SpringApplication app = new SpringApplication(ToolboxApplication.class);
        // Spring Boot 默认 java.awt.headless=true，AWT 的 Desktop 随之整体不可用；而「移入回收站」
        // 只有 Desktop.moveToTrash 一条路，于是 TrashBin.available() 恒为 false —— 开发机清理整块
        // 被禁用（前端红条「无桌面会话」），TreeSize 的单文件删除则静默降级成永久删除。本工程是本机
        // 桌面单用户工具，必然跑在有桌面会话里，所以显式关掉。真无桌面时 moveToTrash 抛
        // HeadlessException（UnsupportedOperationException 子类），TrashBin 已捕获并如实上报失败。
        //
        // 必须在这里设而不是写 spring.main.headless —— SpringApplication.run() 里
        // configureHeadlessProperty() 早于 prepareEnvironment()，yml 里的值绑定不及时，不生效。
        app.setHeadless(false);
        app.run(applicationArgs);
    }
}
