package com.exceptioncoder.toolbox.claudechat.service.environment;

import com.exceptioncoder.toolbox.claudechat.service.ForgeEnvironmentCommandRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;

/** 独立 Go 探测制品的协议适配器，不接受用户命令或降级到 Java。 */
@Component("claudeChatGoEnvironmentProbeEngine")
public class GoEnvironmentProbeEngine implements EnvironmentProbeEngine {
    private final ForgeEnvironmentCommandRunner runner;
    private final ObjectMapper mapper;
    private final Path binary;

    public GoEnvironmentProbeEngine(ForgeEnvironmentCommandRunner runner, ObjectMapper mapper,
            @Value("${toolbox.environment.go-binary:}") String configuredBinary) {
        this.runner = runner;
        this.mapper = mapper;
        String suffix = System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win") ? ".exe" : "";
        binary = configuredBinary.isBlank()
                ? Path.of(System.getProperty("user.home"), ".kai-toolbox", "bin", "environment-probe" + suffix)
                : Path.of(configuredBinary).toAbsolutePath().normalize();
    }

    @Override
    public String id() {
        return "go";
    }

    @Override
    public List<EnvironmentProbeResult> inspect(String path) {
        if (!Files.isRegularFile(binary)) {
            throw new IllegalStateException("Go 检测器未构建，请运行 node scripts/build-environment-go.mjs 后重试，或选择 Java");
        }
        var result = runner.runProtocol(List.of(binary.toString()), Duration.ofSeconds(45), path);
        if (!result.succeeded()) {
            throw new IllegalStateException("Go 检测器执行失败，请重新构建后重试，或选择 Java：" + result.output());
        }
        return decode(result.output());
    }

    List<EnvironmentProbeResult> decode(String json) {
        try {
            var response = mapper.readValue(json, Response.class);
            if (response.protocolVersion() == null || response.protocolVersion() != 1
                    || !"go".equals(response.engine()) || response.results() == null
                    || response.results().size() != EnvironmentProbeCatalog.IDS.size()) {
                throw new IllegalArgumentException("协议或命令数量不匹配");
            }
            var ids = new HashSet<String>();
            for (var item : response.results()) {
                if (item == null || !EnvironmentProbeCatalog.IDS.contains(item.id()) || !ids.add(item.id())
                        || item.exitCode() == null || item.completed() == null || item.output() == null
                        || item.output().length() > 16000 || item.durationMs() == null || item.durationMs() < 0) {
                    throw new IllegalArgumentException("命令结果缺失、重复或无效");
                }
            }
            return response.results();
        } catch (Exception exception) {
            throw new IllegalStateException("Go 检测器协议不兼容，请重新构建后重试，或选择 Java", exception);
        }
    }

    /** @param protocolVersion 协议版本 @param engine 执行实现 @param results 固定命令结果 */
    private record Response(Integer protocolVersion, String engine, List<EnvironmentProbeResult> results) {
    }
}
