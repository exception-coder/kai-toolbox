package com.exceptioncoder.toolbox.performance.infrastructure;

import com.exceptioncoder.toolbox.performance.application.StartupTelemetry;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** 仅在显式配置路径时原子写入测量报告，写入失败不影响业务启动。 */
public final class StartupReportWriter {

    private static final Logger LOG = LoggerFactory.getLogger(StartupReportWriter.class);
    private final Path target;
    private final ObjectMapper mapper;

    public StartupReportWriter(Path target) {
        this.target = target;
        this.mapper = target == null ? null : new ObjectMapper();
    }

    public synchronized void write(StartupTelemetry telemetry) {
        if (target == null) {
            return;
        }
        Path temporary = target.resolveSibling(target.getFileName() + ".tmp");
        try {
            Files.createDirectories(target.toAbsolutePath().getParent());
            mapper.writerWithDefaultPrettyPrinter().writeValue(temporary.toFile(), telemetry.snapshot());
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException | RuntimeException exception) {
            LOG.warn("Startup telemetry report unavailable: {}", target, exception);
        }
    }
}
