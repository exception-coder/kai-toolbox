package com.exceptioncoder.toolbox.prdclarify.delivery;

import com.exceptioncoder.toolbox.llm.spi.LocalProjectResolver;
import com.exceptioncoder.toolbox.prdclarify.config.DeliveryVerificationProperties;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryVerificationRun;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryVerificationStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.DeliveryVerificationRunRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 白名单构建与测试验证运行的应用服务。 */
@Service
public class DeliveryVerificationService {

    private static final Logger log = LoggerFactory.getLogger(DeliveryVerificationService.class);
    private static final int MAX_OUTPUT_LENGTH = 32 * 1024;
    private static final int MAX_ERROR_LENGTH = 1000;
    private static final Pattern TEST_COUNT = Pattern.compile("(?i)(?:Tests run:\\s*|Tests\\s+)(\\d+)");

    private final PrdSessionRepository sessionRepository;
    private final DeliveryVerificationRunRepository runRepository;
    private final ObjectProvider<LocalProjectResolver> localProjectResolver;
    private final DeliveryGitHeadResolver gitHeadResolver;
    private final Map<String, DeliveryVerificationProperties.Command> commands;

    public DeliveryVerificationService(
            PrdSessionRepository sessionRepository,
            DeliveryVerificationRunRepository runRepository,
            ObjectProvider<LocalProjectResolver> localProjectResolver,
            DeliveryGitHeadResolver gitHeadResolver,
            DeliveryVerificationProperties properties) {
        this.sessionRepository = sessionRepository;
        this.runRepository = runRepository;
        this.localProjectResolver = localProjectResolver;
        this.gitHeadResolver = gitHeadResolver;
        this.commands = validateCommands(properties.commands());
    }

    /** 校验会话权限与命令白名单，登记后异步执行验证。 */
    public DeliveryVerificationRun start(
            String sessionId,
            String commandId,
            boolean administrator,
            Long userId) {
        DeliveryVerificationProperties.Command command = command(commandId);
        PrdSession session = visibleSession(sessionId, administrator, userId);
        Path projectRoot = resolveProjectRoot(session.getProject());
        String gitHead = gitHeadResolver.resolve(projectRoot);
        if (runRepository.existsRunning(sessionId)) {
            throw new IllegalStateException("该需求已有验证任务运行中");
        }

        long now = System.currentTimeMillis();
        DeliveryVerificationRun run = new DeliveryVerificationRun(
                UUID.randomUUID().toString(), sessionId, command.id(), gitHead,
                DeliveryVerificationStatus.RUNNING, null, null, null, null,
                now, null, now, now);
        try {
            runRepository.insert(run);
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalStateException("该需求已有验证任务运行中", exception);
        }
        Thread.ofVirtual().name("delivery-verification-").start(() -> execute(run, command, projectRoot));
        return run;
    }

    /** 返回会话最新运行及其相对当前 Git HEAD 的过期状态。 */
    public Optional<RunProjection> latest(String sessionId, String projectName) {
        return runRepository.findLatest(sessionId).map(run -> {
            boolean stale = false;
            try {
                stale = !run.gitHead().equals(gitHeadResolver.resolve(resolveProjectRoot(projectName)));
            } catch (Exception exception) {
                stale = true;
            }
            return new RunProjection(run, stale);
        });
    }

    /** 返回可供前端选择的安全命令元数据，不暴露 argv。 */
    public List<CommandOption> commandOptions() {
        return commands.values().stream()
                .map(command -> new CommandOption(command.id(), command.label()))
                .toList();
    }

    private void execute(
            DeliveryVerificationRun run,
            DeliveryVerificationProperties.Command command,
            Path projectRoot) {
        Integer exitCode = null;
        String output = "";
        DeliveryVerificationStatus status;
        String error = null;
        try {
            Process process = new ProcessBuilder(platformArgv(command.argv()))
                    .directory(projectRoot.toFile())
                    .redirectErrorStream(true)
                    .start();
            StringBuilder captured = new StringBuilder();
            Thread reader = Thread.ofVirtual().name("delivery-verification-output-").start(
                    () -> readOutput(process, captured));
            boolean finished = process.waitFor(timeout(command), TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                process.waitFor(5, TimeUnit.SECONDS);
                reader.join(5_000);
                status = DeliveryVerificationStatus.ERROR;
                error = "验证命令执行超时";
            } else {
                reader.join(5_000);
                exitCode = process.exitValue();
                status = exitCode == 0
                        ? DeliveryVerificationStatus.SUCCEEDED
                        : DeliveryVerificationStatus.FAILED;
            }
            output = sanitize(captured.toString(), projectRoot);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            status = DeliveryVerificationStatus.ERROR;
            error = "验证命令被中断";
        } catch (Exception exception) {
            status = DeliveryVerificationStatus.ERROR;
            error = abbreviate(exception.getMessage());
            log.warn("[delivery-verification] 执行失败 runId={} commandId={}", run.id(), run.commandId(), exception);
        }

        long finishedAt = System.currentTimeMillis();
        if (!runRepository.complete(run.id(), status, exitCode, testCount(output), output,
                abbreviate(error), finishedAt)) {
            log.warn("[delivery-verification] 运行已被其他终态占用 runId={}", run.id());
        }
    }

    private static void readOutput(Process process, StringBuilder captured) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                appendBounded(captured, line + System.lineSeparator());
            }
        } catch (Exception exception) {
            appendBounded(captured, "[output unavailable]");
            log.warn("[delivery-verification] 读取进程输出失败", exception);
        }
    }

    private static void appendBounded(StringBuilder target, String value) {
        target.append(value);
        if (target.length() > MAX_OUTPUT_LENGTH) {
            target.delete(0, target.length() - MAX_OUTPUT_LENGTH);
        }
    }

    private PrdSession visibleSession(String sessionId, boolean administrator, Long userId) {
        PrdSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (!administrator && (userId == null || !userId.equals(session.getCreatedByUserId()))) {
            throw new IllegalArgumentException("无权验证该需求");
        }
        return session;
    }

    private Path resolveProjectRoot(String projectName) {
        LocalProjectResolver resolver = localProjectResolver.getIfAvailable();
        if (resolver == null) {
            throw new IllegalArgumentException("本地项目解析能力不可用");
        }
        LocalProjectResolver.ProjectLocation location = resolver.resolve(projectName)
                .orElseThrow(() -> new IllegalArgumentException("未匹配到项目“" + projectName + "”的本地工作目录"));
        try {
            Path root = Path.of(location.path()).toRealPath();
            if (!Files.isDirectory(root)) {
                throw new IllegalArgumentException("本地项目目录不可访问");
            }
            return root;
        } catch (Exception exception) {
            throw new IllegalArgumentException("本地项目目录不可访问", exception);
        }
    }

    private DeliveryVerificationProperties.Command command(String commandId) {
        if (commandId == null || commandId.isBlank() || !commands.containsKey(commandId)) {
            throw new IllegalArgumentException("验证命令不在服务端白名单中");
        }
        return commands.get(commandId);
    }

    private static Map<String, DeliveryVerificationProperties.Command> validateCommands(
            List<DeliveryVerificationProperties.Command> configured) {
        Map<String, DeliveryVerificationProperties.Command> result = new LinkedHashMap<>();
        for (DeliveryVerificationProperties.Command command : configured) {
            if (command.id() == null || command.id().isBlank()
                    || command.label() == null || command.label().isBlank()
                    || command.argv().isEmpty()
                    || command.argv().stream().anyMatch(item -> item == null || item.isBlank())) {
                throw new IllegalStateException("Delivery 验证命令配置不完整");
            }
            if (result.putIfAbsent(command.id(), command) != null) {
                throw new IllegalStateException("Delivery 验证命令 ID 重复: " + command.id());
            }
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(result));
    }

    private static int timeout(DeliveryVerificationProperties.Command command) {
        return Math.max(1, Math.min(3600, command.timeoutSeconds()));
    }

    /** Windows 的 Maven/NPM 入口是 .cmd；在受信 PATH 中确认存在后显式执行。 */
    static List<String> platformArgv(List<String> configuredArgv) {
        if (!System.getProperty("os.name", "").toLowerCase().contains("win")) {
            return configuredArgv;
        }
        String executable = configuredArgv.getFirst();
        if (executable.contains(".") || executable.contains("\\") || executable.contains("/")) {
            return configuredArgv;
        }
        String candidateName = executable + ".cmd";
        String pathValue = System.getenv("PATH");
        if (pathValue == null || pathValue.isBlank()) {
            return configuredArgv;
        }
        boolean commandExists = List.of(pathValue.split(Pattern.quote(System.getProperty("path.separator"))))
                .stream()
                .map(Path::of)
                .map(directory -> directory.resolve(candidateName))
                .anyMatch(Files::isRegularFile);
        if (!commandExists) {
            return configuredArgv;
        }
        List<String> resolved = new ArrayList<>(configuredArgv);
        resolved.set(0, candidateName);
        return List.copyOf(resolved);
    }

    private static Integer testCount(String output) {
        Matcher matcher = TEST_COUNT.matcher(output == null ? "" : output);
        Integer max = null;
        while (matcher.find()) {
            int current = Integer.parseInt(matcher.group(1));
            max = max == null ? current : Math.max(max, current);
        }
        return max;
    }

    private static String sanitize(String output, Path projectRoot) {
        String sanitized = output == null ? "" : output;
        sanitized = sanitized.replace(projectRoot.toString(), "${PROJECT_ROOT}");
        String userHome = System.getProperty("user.home");
        if (userHome != null && !userHome.isBlank()) {
            sanitized = sanitized.replace(userHome, "${USER_HOME}");
        }
        return sanitized.length() <= MAX_OUTPUT_LENGTH
                ? sanitized
                : sanitized.substring(sanitized.length() - MAX_OUTPUT_LENGTH);
    }

    private static String abbreviate(String error) {
        if (error == null || error.isBlank()) {
            return null;
        }
        String normalized = error.trim();
        return normalized.length() <= MAX_ERROR_LENGTH
                ? normalized
                : normalized.substring(0, MAX_ERROR_LENGTH);
    }

    /** 最新运行与当前项目快照的关系。 */
    public record RunProjection(DeliveryVerificationRun run, boolean stale) {
    }

    /** 前端可见的命令选项，不暴露执行参数。 */
    public record CommandOption(String id, String label) {
    }
}
