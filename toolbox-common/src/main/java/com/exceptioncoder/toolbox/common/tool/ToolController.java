package com.exceptioncoder.toolbox.common.tool;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/tools")
public class ToolController {

    private final ToolRegistry registry;

    public ToolController(ToolRegistry registry) {
        this.registry = registry;
    }

    @GetMapping
    public List<ToolView> list() {
        return registry.all().stream().map(ToolView::from).toList();
    }

    public record ToolView(
            String id,
            String name,
            String icon,
            String route,
            String group,
            String description,
            int order
    ) {
        static ToolView from(ToolDescriptor d) {
            return new ToolView(
                    d.id(),
                    d.name(),
                    d.icon(),
                    d.route(),
                    d.group(),
                    d.description(),
                    d.order()
            );
        }
    }
}
