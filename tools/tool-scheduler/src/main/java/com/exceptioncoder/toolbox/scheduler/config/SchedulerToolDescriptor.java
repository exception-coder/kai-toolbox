package com.exceptioncoder.toolbox.scheduler.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class SchedulerToolDescriptor implements ToolDescriptor {
    @Override public String id() { return "scheduler"; }
    @Override public String name() { return "调度中心"; }
    @Override public String icon() { return "timer-reset"; }
    @Override public String route() { return "/tools/scheduler"; }
    @Override public String group() { return "系统"; }
    @Override public String description() { return "观察 Spring 定时任务并管理增强任务的运行、暂停与执行历史"; }
    @Override public int order() { return 19; }
}
