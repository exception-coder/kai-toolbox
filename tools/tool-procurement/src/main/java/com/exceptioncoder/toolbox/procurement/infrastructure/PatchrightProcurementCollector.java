package com.exceptioncoder.toolbox.procurement.infrastructure;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementCollector;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Capture;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** 调用固定 Patchright 脚本，参数仅通过 JSON stdin 传输。 */
@Component
public class PatchrightProcurementCollector implements ProcurementCollector {
    private final ObjectMapper mapper;
    private final String node;
    private final String directory;

    public PatchrightProcurementCollector(ObjectMapper mapper,
            @Value("${toolbox.browser-request.sidecar.node-path:node}") String node,
            @Value("${toolbox.browser-request.sidecar.dir:node-services/undetected-browser}") String directory) {
        this.mapper = mapper;
        this.node = node;
        this.directory = directory;
    }

    @Override
    public Capture capture(String url, Set<String> hosts) {
        Process process = null;
        Path output = null;
        Path error = null;
        try {
            Path script = ProcurementScriptPaths.resolve(directory, "procurement-capture.mjs");
            if (!Files.isRegularFile(script)) {
                throw new IllegalStateException("未找到采集脚本，请配置浏览器服务目录并安装 Patchright");
            }
            output = Files.createTempFile("procurement-capture-", ".json");
            error = Files.createTempFile("procurement-capture-", ".log");
            process = new ProcessBuilder(node, script.toString()).redirectOutput(output.toFile())
                    .redirectError(error.toFile()).start();
            try (var input = process.getOutputStream()) {
                mapper.writeValue(input, Map.of("url", url, "hosts", hosts));
            }
            if (!process.waitFor(75, TimeUnit.SECONDS)) {
                throw new IllegalStateException("采集超时（75 秒），可重试或打开来源核验");
            }
            var result = mapper.readTree(Files.readString(output, StandardCharsets.UTF_8));
            if (result == null || result.has("error") || process.exitValue() != 0) {
                throw new IllegalStateException(result != null && result.has("error")
                        ? result.path("error").asText() : "浏览器采集未完成，请检查 Patchright 安装");
            }
            return mapper.treeToValue(result, Capture.class);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("采集已中断", e);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("浏览器采集不可用，请检查 Node 与 Patchright 安装", e);
        } finally {
            if (process != null && process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
            deleteTemporary(output);
            deleteTemporary(error);
        }
    }

    private void deleteTemporary(Path path) {
        if (path != null) {
            try { Files.deleteIfExists(path); }
            catch (java.io.IOException e) { path.toFile().deleteOnExit(); }
        }
    }
}
