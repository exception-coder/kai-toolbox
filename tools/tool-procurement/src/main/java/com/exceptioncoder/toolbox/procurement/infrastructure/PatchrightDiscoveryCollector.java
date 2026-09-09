package com.exceptioncoder.toolbox.procurement.infrastructure;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementDiscovery;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** 消费固定脚本的逐页事件，进程超时和退出必须明确失败。 */
@Component
public class PatchrightDiscoveryCollector implements ProcurementDiscovery.Collector {
    private final ObjectMapper mapper;
    private final String node;
    private final String directory;
    public PatchrightDiscoveryCollector(ObjectMapper mapper,
            @Value("${toolbox.browser-request.sidecar.node-path:node}") String node,
            @Value("${toolbox.browser-request.sidecar.dir:node-services/undetected-browser}") String directory) {
        this.mapper = mapper;
        this.node = node;
        this.directory = directory;
    }
    @Override
    public void discover(String date, Consumer<ProcurementDiscovery.Event> consumer) {
        Process process = null;
        Path errorLog = null;
        try {
            Path script = ProcurementScriptPaths.resolve(directory, "procurement-discover.mjs");
            errorLog = java.nio.file.Files.createTempFile("procurement-discovery-", ".log");
            process = new ProcessBuilder(node, script.toString()).directory(script.getParent().toFile())
                    .redirectError(errorLog.toFile()).start();
            Process running = process;
            process.onExit().orTimeout(20, TimeUnit.MINUTES).exceptionally(error -> {
                stop(running);
                return null;
            });
            try (var input = process.getOutputStream()) { mapper.writeValue(input, Map.of("date", date)); }
            boolean done = false;
            try (var reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    ProcurementDiscovery.Event event = mapper.readerFor(ProcurementDiscovery.Event.class)
                            .without(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                            .readValue(line);
                    if ("fatal".equals(event.type())) { throw new IllegalStateException(event.error()); }
                    consumer.accept(event);
                    done |= "done".equals(event.type());
                }
            }
            if (process.waitFor() != 0 || !done) {
                String diagnostic = java.nio.file.Files.readString(errorLog, StandardCharsets.UTF_8);
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("链接发现退出 {}：{}", process.exitValue(), diagnostic);
                throw new IllegalStateException("链接发现进程退出或超过 20 分钟，已保存链接保留；请检查服务日志");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("链接发现已中断", e);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("链接发现脚本不可用或返回无效数据，请检查 Node/Patchright", e);
        } finally {
            if (process != null && process.isAlive()) { stop(process); }
            if (errorLog != null) {
                try { java.nio.file.Files.deleteIfExists(errorLog); }
                catch (java.io.IOException e) { errorLog.toFile().deleteOnExit(); }
            }
        }
    }
    private void stop(Process process) {
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
    }
}
