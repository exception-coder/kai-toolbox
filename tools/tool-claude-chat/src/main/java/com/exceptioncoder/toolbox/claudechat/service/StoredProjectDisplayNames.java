package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.project.ProjectDisplayNames;
import com.exceptioncoder.toolbox.claudechat.repository.ProjectAliasRepository;
import org.springframework.stereotype.Component;
import java.util.Map;

/** 只提供存量别名，不扫描目录或复制主数据。 */
@Component
public class StoredProjectDisplayNames implements ProjectDisplayNames {
    private final ProjectAliasRepository repository;
    public StoredProjectDisplayNames(ProjectAliasRepository repository) { this.repository = repository; }
    public Map<String, String> aliases() { return repository.findAll(); }
}
