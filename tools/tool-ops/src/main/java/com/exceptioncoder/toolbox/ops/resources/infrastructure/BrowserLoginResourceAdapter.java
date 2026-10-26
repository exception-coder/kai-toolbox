package com.exceptioncoder.toolbox.ops.resources.infrastructure;

import com.exceptioncoder.toolbox.common.resource.BrowserLoginResources;
import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;
import com.exceptioncoder.toolbox.ops.resources.application.ApplicationResourceService;
import com.exceptioncoder.toolbox.ops.resources.domain.ApplicationResource;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Set;

/** 浏览器预览复用资源中心账号，不建立第二份凭据配置。 */
@Component
public class BrowserLoginResourceAdapter implements BrowserLoginResources {
    private static final Set<String> ENVIRONMENTS = Set.of("LOCAL", "DEV", "TEST", "UAT");
    private final ApplicationResourceService resources;

    public BrowserLoginResourceAdapter(ApplicationResourceService resources) {
        this.resources = resources;
    }

    @Override
    public List<BrowserLoginTarget> targets() {
        return resources.list().stream().filter(this::supported).map(this::target).toList();
    }

    @Override
    public BrowserLoginTarget require(String id) {
        ApplicationResource resource = resources.required(id);
        if (!supported(resource)) {
            throw new IllegalArgumentException("预览需要已配置账号的 LOCAL/DEV/TEST/UAT 应用资源");
        }
        return target(resource);
    }

    @Override
    public List<BrowserLoginTarget> interactiveTargets() {
        return resources.list().stream().filter(this::interactiveSupported).map(this::target).toList();
    }

    @Override
    public BrowserLoginTarget requireInteractive(String id) {
        ApplicationResource resource = resources.required(id);
        if (!interactiveSupported(resource)) {
            throw new IllegalArgumentException("预览需要已配置账号的应用资源");
        }
        return target(resource);
    }

    private boolean interactiveSupported(ApplicationResource value) {
        return (ENVIRONMENTS.contains(value.environment()) || "PROD".equals(value.environment()))
                && value.hasPassword() && value.username() != null && !value.username().isBlank();
    }

    private boolean supported(ApplicationResource value) {
        return ENVIRONMENTS.contains(value.environment()) && value.hasPassword() && value.username() != null;
    }

    private BrowserLoginTarget target(ApplicationResource value) {
        return new BrowserLoginTarget(value.id(), value.name(), value.environment(), value.baseUrl(),
                value.username(), value.password(), value.usernameField(), value.passwordField(), value.loginPath());
    }
}
