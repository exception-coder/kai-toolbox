package com.exceptioncoder.forge.quality.core;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.ServiceLoader;
import java.util.Set;

/** Coordinates detection, checker routing, failure isolation, and reporting. */
public final class QualityEngine {
    private final List<QualityPlugin> plugins;
    private final Clock clock;

    /** Creates an engine backed by explicitly supplied plugins. */
    public QualityEngine(List<QualityPlugin> plugins) {
        this(plugins, Clock.systemUTC());
    }

    QualityEngine(List<QualityPlugin> plugins, Clock clock) {
        this.plugins = plugins.stream().sorted(Comparator.comparing(QualityPlugin::id)).toList();
        this.clock = clock;
    }

    /** Discovers plugins from the current thread context class loader. */
    public static QualityEngine discover() {
        ClassLoader loader = Thread.currentThread().getContextClassLoader();
        List<QualityPlugin> plugins = ServiceLoader.load(QualityPlugin.class, loader).stream()
                .map(ServiceLoader.Provider::get)
                .toList();
        return new QualityEngine(plugins);
    }

    /** Detects and de-duplicates all project capabilities. */
    public List<StackCapability> detect(ChangeSet changeSet) {
        DetectionContext context = new DetectionContext(changeSet.projectRoot(), changeSet.files());
        Map<String, StackCapability> capabilities = new LinkedHashMap<>();
        for (QualityPlugin plugin : plugins) {
            for (StackDetector detector : plugin.detectors()) {
                for (StackCapability capability : detector.detect(context)) {
                    capabilities.merge(capability.id(), capability, QualityEngine::mergeCapability);
                }
            }
        }
        return capabilities.values().stream().sorted(Comparator.comparing(StackCapability::id)).toList();
    }

    /** Runs every applicable checker and returns one complete report. */
    public QualityReport check(ChangeSet changeSet) {
        return check(changeSet, null);
    }

    /** Runs checkers enabled by the configured capability allow-list. */
    public QualityReport check(ChangeSet changeSet, Set<String> enabledCapabilities) {
        Instant startedAt = clock.instant();
        List<StackCapability> capabilities = detect(changeSet);
        if (enabledCapabilities != null) {
            capabilities = capabilities.stream()
                    .filter(capability -> enabledCapabilities.contains(capability.id()))
                    .toList();
        }
        Set<String> capabilityIds = capabilities.stream().map(StackCapability::id).collect(java.util.stream.Collectors.toSet());
        List<String> executed = new ArrayList<>();
        List<Finding> findings = new ArrayList<>();
        for (QualityPlugin plugin : plugins) {
            for (QualityChecker checker : plugin.checkers()) {
                if (!capabilityIds.containsAll(checker.requiredCapabilities())) {
                    continue;
                }
                executed.add(checker.id());
                runChecker(checker, changeSet, capabilities, findings);
            }
        }
        findings.sort(Comparator.comparing(Finding::severity).reversed()
                .thenComparing(Finding::ruleId).thenComparing(Finding::file));
        GateStatus status = findings.stream().anyMatch(finding -> finding.severity() == Severity.ERROR)
                ? GateStatus.FAILED : GateStatus.PASSED;
        long duration = Duration.between(startedAt, clock.instant()).toMillis();
        return new QualityReport(status, startedAt, duration, pluginIds(), capabilities, executed, findings);
    }

    /** Returns loaded plugin identifiers. */
    public List<String> pluginIds() {
        return plugins.stream().map(QualityPlugin::id).toList();
    }

    private static void runChecker(QualityChecker checker, ChangeSet changeSet,
                                   List<StackCapability> capabilities, List<Finding> findings) {
        try {
            findings.addAll(checker.check(changeSet, capabilities));
        } catch (RuntimeException exception) {
            findings.add(new Finding(checker.id(), Severity.ERROR,
                    "Checker execution failed: " + exception.getMessage(), "", null,
                    exception.getClass().getSimpleName()));
        }
    }

    private static StackCapability mergeCapability(StackCapability left, StackCapability right) {
        List<String> evidence = new ArrayList<>(left.evidence());
        right.evidence().stream().filter(item -> !evidence.contains(item)).forEach(evidence::add);
        return new StackCapability(left.id(), left.displayName(), evidence);
    }
}
