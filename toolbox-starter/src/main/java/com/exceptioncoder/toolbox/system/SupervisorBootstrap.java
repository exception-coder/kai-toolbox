package com.exceptioncoder.toolbox.system;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.File;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * 启动自举守护进程:App 就绪时若守护进程(run-supervised.ps1 的 HTTP 控制口)未运行,
 * 则自动拉起它——这样即便用 IntelliJ / 直接起 App,最终也归守护管、一键重启可用。
 *
 * <p>防回路:守护脚本启动后端时会注入环境变量 {@code KAI_SUPERVISED=1};本实例若带该变量
 * 说明就是守护脚本起的,直接跳过(否则守护脚本起的 App 又去起守护脚本 → 死循环)。
 *
 * <p>仅 Windows(脚本是 .ps1)+ 脚本存在(dev 才有源码;prod fat-jar 无脚本即跳过)。
 * 注意:自举后守护进程会强制接管 18080、杀掉当前 App 并重新编译拉起一个受守护实例
 * (首启会有一次重启循环,期间当前连接/会话中断)。可用 {@code toolbox.system.supervisor-bootstrap=false} 关闭。
 */
@Component
public class SupervisorBootstrap {

    private static final Logger log = LoggerFactory.getLogger(SupervisorBootstrap.class);

    private final SystemProperties props;

    public SupervisorBootstrap(SystemProperties props) {
        this.props = props;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void ensureSupervisor() {
        if (!props.isSupervisorBootstrap()) return;
        if ("1".equals(System.getenv("KAI_SUPERVISED"))) {
            log.info("[supervisor-bootstrap] 本实例由守护脚本启动(KAI_SUPERVISED=1),跳过自举");
            return;
        }
        if (!System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            log.debug("[supervisor-bootstrap] 非 Windows,跳过(守护脚本为 .ps1)");
            return;
        }
        Path script = Path.of(props.getSupervisorScript());
        Path abs = script.isAbsolute() ? script : Path.of(System.getProperty("user.dir")).resolve(script);
        if (!Files.exists(abs)) {
            log.info("[supervisor-bootstrap] 守护脚本不存在({}),跳过(非 dev 环境)", abs);
            return;
        }
        if (isPortOpen("127.0.0.1", props.getSupervisorPort(), 800)) {
            log.info("[supervisor-bootstrap] 守护进程已在 :{} 运行,跳过自举", props.getSupervisorPort());
            return;
        }
        try {
            // start "<title>" 在新窗口 detached 拉起,使其在本 App 随后被守护进程杀掉时仍存活
            new ProcessBuilder("cmd", "/c", "start", "kai-supervisor",
                    props.getPwshBin(), "-NoExit", "-File", abs.toString())
                    .directory(new File(System.getProperty("user.dir")))
                    .start();
            log.warn("[supervisor-bootstrap] 未检测到守护进程,已自举拉起 {} {}。" +
                            "守护进程将强制接管 :18080、杀掉当前实例并重新编译拉起受守护实例(首启会有一次重启循环)。",
                    props.getPwshBin(), abs);
        } catch (Exception e) {
            log.warn("[supervisor-bootstrap] 自举守护脚本失败:{}", e.getMessage());
        }
    }

    private static boolean isPortOpen(String host, int port, int timeoutMs) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), timeoutMs);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
