package com.exceptioncoder.toolbox.scheduler.service;

import com.exceptioncoder.toolbox.common.scheduling.ConcurrentExecutionPolicy;
import com.exceptioncoder.toolbox.common.scheduling.ScheduledTaskInfo;
import com.exceptioncoder.toolbox.common.scheduling.ToolboxScheduled;
import com.exceptioncoder.toolbox.scheduler.domain.SchedulerModels.ExecutionView;
import com.exceptioncoder.toolbox.scheduler.domain.SchedulerModels.TaskView;
import com.exceptioncoder.toolbox.scheduler.repository.SchedulerRepository;
import com.exceptioncoder.toolbox.scheduler.repository.SchedulerRepository.TaskOverride;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.context.event.EventListener;
import org.springframework.context.ApplicationContext;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.core.MethodIntrospector;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.config.FixedRateTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;
import org.springframework.scheduling.config.TaskExecutionOutcome;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.scheduling.support.ScheduledMethodRunnable;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicInteger;

import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class SchedulerService {
    private static final Logger log = LoggerFactory.getLogger(SchedulerService.class);
    private static final int HISTORY_LIMIT = 200;
    private final ApplicationContext applicationContext;
    private final ListableBeanFactory beanFactory;
    private final TaskScheduler taskScheduler;
    private final List<ScheduledTaskHolder> nativeTaskHolders;
    private final SchedulerRepository repository;
    private final SchedulerEventPublisher eventPublisher;
    private final Map<String, ManagedTask> managedTasks = new LinkedHashMap<>();

    public SchedulerService(ApplicationContext applicationContext, ListableBeanFactory beanFactory,
                            @Qualifier("taskScheduler") TaskScheduler taskScheduler,
                            List<ScheduledTaskHolder> nativeTaskHolders, SchedulerRepository repository,
                            SchedulerEventPublisher eventPublisher) {
        this.applicationContext = applicationContext;
        this.beanFactory = beanFactory;
        this.taskScheduler = taskScheduler;
        this.nativeTaskHolders = nativeTaskHolders;
        this.repository = repository;
        this.eventPublisher = eventPublisher;
    }

    @EventListener(ApplicationReadyEvent.class)
    public synchronized void initialize() {
        repository.abortStaleExecutions();
        scanManagedTasks();
        managedTasks.values().forEach(this::applyPersistedStateAndSchedule);
        log.info("scheduler center initialized: {} managed tasks, {} native tasks",
                managedTasks.size(), nativeTasks().size());
    }

    public synchronized List<TaskView> listTasks() {
        List<TaskView> tasks = new ArrayList<>();
        managedTasks.values().stream().map(this::toView).forEach(tasks::add);
        tasks.addAll(nativeTasks());
        tasks.sort(Comparator.comparing(TaskView::source).thenComparing(TaskView::name));
        return tasks;
    }

    public List<ExecutionView> listExecutions(String taskId, int requestedLimit) {
        requireManaged(taskId);
        int limit = Math.max(1, Math.min(requestedLimit, HISTORY_LIMIT));
        return repository.listExecutions(taskId, limit);
    }

    public synchronized void runNow(String taskId) {
        ManagedTask task = requireManaged(taskId);
        if (!task.tryAcquire()) {
            throw new ResponseStatusException(CONFLICT, "任务正在执行，已跳过重复运行");
        }
        ScheduledFuture<?> future = taskScheduler.schedule(() -> executeAcquired(task, "MANUAL"), Instant.now());
        if (future == null) {
            task.release();
            throw new IllegalStateException("任务调度器未接受本次执行");
        }
        eventPublisher.publish("task", toView(task));
    }

    public synchronized void pause(String taskId) {
        ManagedTask task = requireManaged(taskId);
        task.enabled = false;
        cancelFuture(task);
        repository.saveOverride(task.id(), false, task.overrideCron, task.overrideZone);
        eventPublisher.publish("task", toView(task));
    }

    public synchronized void resume(String taskId) {
        ManagedTask task = requireManaged(taskId);
        task.enabled = true;
        repository.saveOverride(task.id(), true, task.overrideCron, task.overrideZone);
        schedule(task);
        eventPublisher.publish("task", toView(task));
    }

    public synchronized void updateCron(String taskId, String cron, String zone) {
        ManagedTask task = requireManaged(taskId);
        if (!StringUtils.hasText(task.annotation.cron())) {
            throw new IllegalArgumentException("只有 Cron 任务支持在线修改表达式");
        }
        String resolvedZone = StringUtils.hasText(zone) ? zone.trim() : ZoneId.systemDefault().getId();
        new CronTrigger(cron, ZoneId.of(resolvedZone));
        task.overrideCron = cron.trim();
        task.overrideZone = resolvedZone;
        repository.saveOverride(task.id(), task.enabled, task.overrideCron, task.overrideZone);
        if (task.enabled) {
            schedule(task);
        }
        eventPublisher.publish("task", toView(task));
    }

    private void scanManagedTasks() {
        for (String beanName : beanFactory.getBeanDefinitionNames()) {
            scanBean(beanName);
        }
    }

    private void scanBean(String beanName) {
        Object bean;
        try {
            bean = applicationContext.getBean(beanName);
        } catch (RuntimeException ex) {
            log.debug("skip unavailable bean while scanning scheduler: {}", beanName);
            return;
        }
        Class<?> targetType = AopUtils.getTargetClass(bean);
        Map<Method, ToolboxScheduled> methods = MethodIntrospector.selectMethods(targetType,
                (MethodIntrospector.MetadataLookup<ToolboxScheduled>) method ->
                        AnnotatedElementUtils.findMergedAnnotation(method, ToolboxScheduled.class));
        methods.forEach((method, annotation) -> registerManaged(bean, method, annotation));
    }

    private void registerManaged(Object bean, Method method, ToolboxScheduled annotation) {
        validate(annotation, method);
        Method invocable = AopUtils.selectInvocableMethod(method, bean.getClass());
        ManagedTask previous = managedTasks.putIfAbsent(annotation.id(),
                new ManagedTask(bean, invocable, annotation));
        if (previous != null) {
            throw new IllegalStateException("重复的增强任务 ID: " + annotation.id());
        }
    }

    private void validate(ToolboxScheduled annotation, Method method) {
        if (method.getParameterCount() != 0) {
            throw new IllegalStateException("增强任务方法必须无参数: " + method);
        }
        int scheduleCount = (StringUtils.hasText(annotation.cron()) ? 1 : 0)
                + (StringUtils.hasText(annotation.fixedRateString()) ? 1 : 0)
                + (StringUtils.hasText(annotation.fixedDelayString()) ? 1 : 0);
        if (scheduleCount != 1) {
            throw new IllegalStateException("增强任务必须且只能声明一种调度方式: " + annotation.id());
        }
        if (AnnotatedElementUtils.hasAnnotation(method, org.springframework.scheduling.annotation.Scheduled.class)) {
            throw new IllegalStateException("增强任务不能同时声明 @Scheduled: " + annotation.id());
        }
    }

    private void applyPersistedStateAndSchedule(ManagedTask task) {
        repository.findOverride(task.id()).ifPresent(override -> applyOverride(task, override));
        if (task.enabled) {
            schedule(task);
        }
    }

    private void applyOverride(ManagedTask task, TaskOverride override) {
        task.enabled = override.enabled();
        task.overrideCron = override.cron();
        task.overrideZone = override.zone();
    }

    private void schedule(ManagedTask task) {
        cancelFuture(task);
        Runnable runnable = () -> execute(task, "SCHEDULED");
        ToolboxScheduled annotation = task.annotation;
        if (StringUtils.hasText(annotation.cron())) {
            String cron = StringUtils.hasText(task.overrideCron) ? task.overrideCron : resolve(annotation.cron());
            String zone = StringUtils.hasText(task.overrideZone) ? task.overrideZone : resolve(annotation.zone());
            ZoneId zoneId = StringUtils.hasText(zone) ? ZoneId.of(zone) : ZoneId.systemDefault();
            task.future = taskScheduler.schedule(runnable, new CronTrigger(cron, zoneId));
        } else {
            scheduleInterval(task, runnable);
        }
    }

    private void scheduleInterval(ManagedTask task, Runnable runnable) {
        ToolboxScheduled annotation = task.annotation;
        Duration initialDelay = parseDuration(annotation.initialDelayString());
        Instant start = Instant.now().plus(initialDelay);
        if (StringUtils.hasText(annotation.fixedRateString())) {
            task.future = taskScheduler.scheduleAtFixedRate(
                    runnable, start, parseDuration(annotation.fixedRateString()));
        } else {
            task.future = taskScheduler.scheduleWithFixedDelay(
                    runnable, start, parseDuration(annotation.fixedDelayString()));
        }
    }

    private void execute(ManagedTask task, String source) {
        if (!task.enabled || !task.tryAcquire()) {
            return;
        }
        executeAcquired(task, source);
    }

    private void executeAcquired(ManagedTask task, String source) {
        String executionId = UUID.randomUUID().toString();
        long startedAt = System.currentTimeMillis();
        repository.startExecution(executionId, task.id(), source, startedAt);
        ExecutionView result;
        try {
            task.method.invoke(task.bean);
            result = finish(executionId, task.id(), source, startedAt, "SUCCESS", null);
        } catch (IllegalAccessException | InvocationTargetException ex) {
            Throwable cause = ex instanceof InvocationTargetException && ex.getCause() != null
                    ? ex.getCause() : ex;
            log.error("managed task failed: {}", task.id(), cause);
            result = finish(executionId, task.id(), source, startedAt, "FAILED", summarize(cause));
        } finally {
            task.release();
        }
        eventPublisher.publish("execution", result);
        eventPublisher.publish("task", toView(task));
    }

    private ExecutionView finish(String id, String taskId, String source, long startedAt,
                                 String status, String error) {
        long endedAt = System.currentTimeMillis();
        repository.finishExecution(id, status, endedAt, endedAt - startedAt, error);
        repository.trimExecutions(taskId, HISTORY_LIMIT);
        return new ExecutionView(id, taskId, source, status, Instant.ofEpochMilli(startedAt),
                Instant.ofEpochMilli(endedAt), endedAt - startedAt, error);
    }

    private TaskView toView(ManagedTask task) {
        List<ExecutionView> recent = repository.listExecutions(task.id(), 1);
        String type = scheduleType(task.annotation);
        String expression = scheduleExpression(task);
        return new TaskView(task.id(), task.annotation.name(), task.annotation.description(),
                task.annotation.owner(), "MANAGED", type, expression, effectiveZone(task), task.enabled,
                true, task.running.get() > 0, nextExecution(task.future), recent.isEmpty() ? null : recent.get(0));
    }

    private List<TaskView> nativeTasks() {
        List<TaskView> views = new ArrayList<>();
        for (ScheduledTaskHolder holder : nativeTaskHolders) {
            for (ScheduledTask task : holder.getScheduledTasks()) {
                views.add(nativeView(task));
            }
        }
        return views;
    }

    private TaskView nativeView(ScheduledTask scheduledTask) {
        org.springframework.scheduling.config.Task task = scheduledTask.getTask();
        String identity = task.toString();
        String name = shortNativeName(identity);
        String description = "Spring @Scheduled 原生任务";
        String owner = "Spring";
        if (task.getRunnable() instanceof ScheduledMethodRunnable runnable) {
            identity = runnable.getTarget().getClass().getName() + "#" + runnable.getMethod().getName();
            name = runnable.getTarget().getClass().getSimpleName() + "." + runnable.getMethod().getName();
            ScheduledTaskInfo taskInfo = AnnotatedElementUtils.findMergedAnnotation(
                    runnable.getMethod(), ScheduledTaskInfo.class);
            if (taskInfo != null) {
                name = taskInfo.name();
                description = taskInfo.description();
                owner = StringUtils.hasText(taskInfo.owner()) ? taskInfo.owner() : owner;
            }
        }
        String type = nativeScheduleType(task);
        TaskExecutionOutcome outcome = task.getLastExecutionOutcome();
        ExecutionView last = outcome.status() == TaskExecutionOutcome.Status.NONE ? null
                : new ExecutionView(null, "spring:" + identity, "SCHEDULED", outcome.status().name(),
                outcome.executionTime(), null, null, summarize(outcome.throwable()));
        return new TaskView("spring:" + identity, name, description, owner,
                "SPRING", type, nativeExpression(task), "", true, false,
                outcome.status() == TaskExecutionOutcome.Status.STARTED, scheduledTask.nextExecution(), last);
    }

    private String shortNativeName(String identity) {
        int methodSeparator = identity.lastIndexOf('.');
        if (methodSeparator < 0) return identity;
        int classSeparator = identity.lastIndexOf('.', methodSeparator - 1);
        return identity.substring(classSeparator + 1);
    }

    private String nativeScheduleType(org.springframework.scheduling.config.Task task) {
        if (task instanceof CronTask) return "CRON";
        if (task instanceof FixedRateTask) return "FIXED_RATE";
        if (task instanceof FixedDelayTask) return "FIXED_DELAY";
        return "CUSTOM";
    }

    private String nativeExpression(org.springframework.scheduling.config.Task task) {
        if (task instanceof CronTask cronTask) return cronTask.getExpression();
        if (task instanceof FixedRateTask fixedRateTask) return fixedRateTask.getIntervalDuration().toString();
        if (task instanceof FixedDelayTask fixedDelayTask) return fixedDelayTask.getIntervalDuration().toString();
        return task.toString();
    }

    private String scheduleType(ToolboxScheduled annotation) {
        if (StringUtils.hasText(annotation.cron())) return "CRON";
        if (StringUtils.hasText(annotation.fixedRateString())) return "FIXED_RATE";
        return "FIXED_DELAY";
    }

    private String scheduleExpression(ManagedTask task) {
        if (StringUtils.hasText(task.annotation.cron())) {
            return StringUtils.hasText(task.overrideCron) ? task.overrideCron : resolve(task.annotation.cron());
        }
        return resolve(StringUtils.hasText(task.annotation.fixedRateString())
                ? task.annotation.fixedRateString() : task.annotation.fixedDelayString());
    }

    private String effectiveZone(ManagedTask task) {
        if (StringUtils.hasText(task.overrideZone)) return task.overrideZone;
        String zone = resolve(task.annotation.zone());
        return StringUtils.hasText(zone) ? zone : ZoneId.systemDefault().getId();
    }

    private ManagedTask requireManaged(String id) {
        ManagedTask task = managedTasks.get(id);
        if (task == null) throw new ResponseStatusException(NOT_FOUND, "增强任务不存在: " + id);
        return task;
    }

    private void cancelFuture(ManagedTask task) {
        if (task.future != null) {
            task.future.cancel(false);
            task.future = null;
        }
    }

    private Instant nextExecution(ScheduledFuture<?> future) {
        return future == null || future.isCancelled() ? null : Instant.ofEpochMilli(future.getDelay(
                java.util.concurrent.TimeUnit.MILLISECONDS) + System.currentTimeMillis());
    }

    private Duration parseDuration(String value) {
        return DurationStyle.detectAndParse(resolve(value));
    }

    private String resolve(String value) {
        if (!StringUtils.hasText(value)) return "";
        String resolved = applicationContext.getEnvironment().resolvePlaceholders(value);
        return resolved == null ? value : resolved;
    }

    private String summarize(Throwable throwable) {
        if (throwable == null) return null;
        String text = throwable.getClass().getSimpleName() + ": " + throwable.getMessage();
        return text.length() <= 500 ? text : text.substring(0, 500);
    }

    private static final class ManagedTask {
        private final Object bean;
        private final Method method;
        private final ToolboxScheduled annotation;
        private final AtomicInteger running = new AtomicInteger();
        private volatile boolean enabled = true;
        private volatile String overrideCron;
        private volatile String overrideZone;
        private volatile ScheduledFuture<?> future;

        private ManagedTask(Object bean, Method method, ToolboxScheduled annotation) {
            this.bean = bean;
            this.method = method;
            this.annotation = annotation;
        }

        private String id() { return annotation.id(); }

        private boolean tryAcquire() {
            if (annotation.concurrency() == ConcurrentExecutionPolicy.ALLOW) {
                running.incrementAndGet();
                return true;
            }
            return running.compareAndSet(0, 1);
        }

        private void release() { running.decrementAndGet(); }
    }
}
