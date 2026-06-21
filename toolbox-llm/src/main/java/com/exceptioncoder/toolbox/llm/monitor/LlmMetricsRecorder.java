package com.exceptioncoder.toolbox.llm.monitor;

import com.exceptioncoder.toolbox.llm.config.LlmProperties;
import com.exceptioncoder.toolbox.llm.config.MonitorProperties;
import com.exceptioncoder.toolbox.llm.monitor.repository.LlmCallLogRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * 监控事件汇聚：内存计数同步更新（保证配额水位即时），落库走有界队列 + 单虚拟线程批量写。
 *
 * <p>「绝不反压业务」——{@link #submit} 队列满时丢最旧并计 dropped；落库异常只丢本批 + 告警，
 * 不冒泡到 LLM 调用路径。
 */
@Component
public class LlmMetricsRecorder {

    private static final Logger log = LoggerFactory.getLogger(LlmMetricsRecorder.class);

    private final LlmCallLogRepository repository;
    private final LlmMetricsRegistry registry;
    private final MonitorProperties props;
    private final ZoneId zone = ZoneId.systemDefault();
    private final BlockingQueue<LlmCallEvent> queue;
    /** Studio 导出器：studioUrl 为空时为 null，不推送。 */
    private final AgentScopeStudioExporter studioExporter;

    private volatile boolean running = true;
    private Thread worker;

    public LlmMetricsRecorder(LlmCallLogRepository repository, LlmMetricsRegistry registry, LlmProperties llmProps) {
        this.repository = repository;
        this.registry = registry;
        this.props = llmProps.getMonitor();
        this.queue = new LinkedBlockingQueue<>(Math.max(100, props.getQueueCapacity()));
        String studioUrl = props.getStudioUrl();
        this.studioExporter = (studioUrl != null && !studioUrl.isBlank())
                ? new AgentScopeStudioExporter(studioUrl, props.getStudioTimeoutMs())
                : null;
    }

    /** 提交一条采集事件：先同步累加内存计数，再异步入队落库。绝不抛出。 */
    public void submit(LlmCallEvent event) {
        try {
            registry.add(event);
        } catch (Exception ex) {
            log.warn("[toolbox-llm] 内存计数累加失败（忽略）: {}", ex.toString());
        }
        if (!queue.offer(event)) {
            queue.poll();
            registry.incDropped();
            queue.offer(event);
        }
    }

    @PostConstruct
    public void start() {
        if (!props.isEnabled()) {
            log.info("[toolbox-llm] 监控已禁用（toolbox.llm.monitor.enabled=false），记录器不启动");
            return;
        }
        warmup();
        worker = Thread.ofVirtual().name("llm-metrics-writer").start(this::loop);
        log.info("[toolbox-llm] 监控记录器已启动（queueCapacity={}, batchSize={}, studio={}）",
                props.getQueueCapacity(), props.getBatchSize(),
                studioExporter != null ? props.getStudioUrl() : "disabled");
    }

    private void warmup() {
        try {
            long startOfDay = LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli();
            var rows = repository.findSince(startOfDay);
            registry.warmup(rows);
            log.info("[toolbox-llm] 监控水位回填当日 {} 条", rows.size());
        } catch (Exception ex) {
            // 表可能尚未建好或为空——容忍，水位从零起算
            log.debug("[toolbox-llm] 监控水位回填跳过: {}", ex.toString());
        }
    }

    private void loop() {
        List<LlmCallEvent> batch = new ArrayList<>();
        while (running || !queue.isEmpty()) {
            try {
                LlmCallEvent first = queue.poll(500, TimeUnit.MILLISECONDS);
                if (first == null) {
                    continue;
                }
                batch.clear();
                batch.add(first);
                queue.drainTo(batch, Math.max(1, props.getBatchSize()) - 1);
                repository.batchInsert(batch);
                if (studioExporter != null) {
                    studioExporter.export(batch);
                }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception ex) {
                log.warn("[toolbox-llm] 监控落库失败，丢弃本批 {} 条: {}", batch.size(), ex.toString());
            }
        }
    }

    @PreDestroy
    public void shutdown() {
        running = false;
        if (worker != null) {
            worker.interrupt();
        }
        try {
            List<LlmCallEvent> rest = new ArrayList<>();
            queue.drainTo(rest);
            if (!rest.isEmpty()) {
                repository.batchInsert(rest);
                if (studioExporter != null) {
                    studioExporter.export(rest);
                }
            }
        } catch (Exception ex) {
            log.debug("[toolbox-llm] 关闭时 flush 跳过: {}", ex.toString());
        }
    }
}
