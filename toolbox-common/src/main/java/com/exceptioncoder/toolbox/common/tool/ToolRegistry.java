package com.exceptioncoder.toolbox.common.tool;

import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;

@Component
public class ToolRegistry {

    private final List<ToolDescriptor> descriptors;

    public ToolRegistry(List<ToolDescriptor> descriptors) {
        this.descriptors = descriptors.stream()
                .sorted(Comparator.comparingInt(ToolDescriptor::order)
                        .thenComparing(ToolDescriptor::name))
                .toList();
    }

    public List<ToolDescriptor> all() {
        return descriptors;
    }
}
