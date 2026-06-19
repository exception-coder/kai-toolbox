package com.exceptioncoder.toolbox.aichat.service.tools;

import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 受限命令执行工具:仅当 {@code toolbox.ai-chat.shell.enabled=true} 时才注册。
 *
 * <p>纵深防御,五层护栏:
 * <ol>
 *   <li><b>默认关闭</b>——本 bean 受 {@link ConditionalOnProperty} 控制,不开启则不存在。</li>
 *   <li><b>不经 shell</b>——{@link ProcessBuilder} 按空格分词直接执行,不走 bash -c / cmd /c,
 *       从根上杜绝 {@code ; | > < $ `} 等元字符注入。</li>
 *   <li><b>前缀白名单</b>——命令必须命中 {@code shell.allow} 中某条前缀,否则拒。</li>
 *   <li><b>元字符/逃逸拦截</b>——含 shell 元字符、{@code ..}、绝对路径一律拒(双保险)。</li>
 *   <li><b>沙箱+超时+截断</b>——限定在 workdir 下执行,超时强杀,输出截断。</li>
 * </ol>
 * 「LLM 提议、代码裁决」:模型只提议要跑什么命令,放不放行、怎么跑全由这里的代码裁定。</p>
 */
@Component
@ConditionalOnProperty(prefix = "toolbox.ai-chat.shell", name = "enabled", havingValue = "true")
public class ShellTool implements ChatToolProvider {

    private static final Logger log = LoggerFactory.getLogger(ShellTool.class);

    /** 危险元字符:出现任一即拒(即便不过 shell,也防御性拦截)。 */
    private static final char[] FORBIDDEN = {'&', '|', ';', '>', '<', '$', '`', '\n', '\r', '\\'};

    private final AiChatProperties props;

    public ShellTool(AiChatProperties props) {
        this.props = props;
    }

    @Tool("在受限沙箱目录中执行一条白名单内的只读 shell 命令并返回输出。"
            + "仅支持安全的查询类命令(如 git status、ls、cat 等),不支持管道、重定向、命令拼接。"
            + "当用户需要查看文件列表、git 状态等本地信息时调用。")
    public String runCommand(@P("要执行的完整命令,例如 git status") String command) {
        AiChatProperties.Shell cfg = props.getShell();
        String cmd = command == null ? "" : command.trim();
        if (cmd.isEmpty()) {
            return "命令为空。";
        }

        // 护栏 4:元字符/逃逸拦截
        String reject = rejectReason(cmd);
        if (reject != null) {
            log.warn("[ai-chat][shell] 拒绝命令(护栏): {} -> {}", cmd, reject);
            return "命令被拒绝:" + reject;
        }
        // 护栏 3:前缀白名单
        if (!isAllowed(cmd, cfg.getAllow())) {
            log.warn("[ai-chat][shell] 拒绝命令(不在白名单): {}", cmd);
            return "命令被拒绝:不在白名单内。当前仅允许只读安全命令(如 " + cfg.getAllow().get(0) + " 等)。";
        }
        return execute(cmd, cfg);
    }

    /** 含危险元字符 / 路径逃逸 / 绝对路径 → 返回拒绝原因;合法返回 null。 */
    private static String rejectReason(String cmd) {
        for (char c : FORBIDDEN) {
            if (cmd.indexOf(c) >= 0) {
                return "命令含禁止字符 '" + c + "'(不支持管道/重定向/命令拼接)";
            }
        }
        if (cmd.contains("..")) {
            return "命令含路径逃逸 '..'";
        }
        // 绝对路径(/etc、C:\ 等)一律拒,强制相对沙箱目录
        for (String token : cmd.split("\\s+")) {
            if (token.startsWith("/") || token.matches("(?i)^[a-z]:[\\\\/].*")) {
                return "不允许绝对路径参数:" + token;
            }
        }
        return null;
    }

    /** 命令(按空格规整后)是否以白名单中某前缀开头。 */
    private static boolean isAllowed(String cmd, List<String> allow) {
        String norm = cmd.replaceAll("\\s+", " ");
        for (String prefix : allow) {
            String p = prefix.trim().replaceAll("\\s+", " ");
            if (norm.equals(p) || norm.startsWith(p + " ")) {
                return true;
            }
        }
        return false;
    }

    /** 护栏 2+5:不经 shell 分词执行,限定沙箱目录,超时强杀,输出截断。 */
    private String execute(String cmd, AiChatProperties.Shell cfg) {
        Path workdir = Path.of(cfg.getWorkdir());
        try {
            Files.createDirectories(workdir);
        } catch (Exception e) {
            return "工作目录不可用:" + e.getMessage();
        }
        List<String> argv = new ArrayList<>(List.of(cmd.split("\\s+")));
        ProcessBuilder pb = new ProcessBuilder(argv)
                .directory(workdir.toFile())
                .redirectErrorStream(true);
        Process proc = null;
        try {
            proc = pb.start();
            String output = readCapped(proc, cfg.getMaxOutputChars());
            boolean done = proc.waitFor(cfg.getTimeoutSeconds(), TimeUnit.SECONDS);
            if (!done) {
                proc.destroyForcibly();
                return "命令执行超时(>" + cfg.getTimeoutSeconds() + "s),已终止。";
            }
            int code = proc.exitValue();
            log.info("[ai-chat][shell] 执行 `{}` exit={}", cmd, code);
            String head = "$ " + cmd + "\n[exit=" + code + "]\n";
            return head + (output.isBlank() ? "(无输出)" : output);
        } catch (Exception e) {
            if (proc != null) {
                proc.destroyForcibly();
            }
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            log.warn("[ai-chat][shell] 执行失败 `{}`: {}", cmd, cause.toString());
            return "命令执行失败:" + cause.getMessage();
        }
    }

    /** 读取进程输出,最多 maxChars 字符,超出截断。 */
    private static String readCapped(Process proc, int maxChars) throws Exception {
        byte[] all = proc.getInputStream().readNBytes(Math.max(1, maxChars) * 2);
        String s = new String(all, StandardCharsets.UTF_8);
        return s.length() <= maxChars ? s : s.substring(0, maxChars) + "…(输出截断)";
    }
}
