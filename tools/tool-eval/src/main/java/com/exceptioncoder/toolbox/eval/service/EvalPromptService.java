package com.exceptioncoder.toolbox.eval.service;

import com.exceptioncoder.toolbox.eval.domain.EvalPrompt;
import com.exceptioncoder.toolbox.eval.repository.EvalPromptRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;

/** 提示词版本管理：只追加，不原地改。 */
@Service
public class EvalPromptService {

    private final EvalPromptRepository repo;

    public EvalPromptService(EvalPromptRepository repo) {
        this.repo = repo;
    }

    /** 该 key 尚无任何版本时植入 v1 并激活；已存在则原样返回 false。 */
    public boolean seedIfAbsent(String promptKey, String content, String note) {
        if (!repo.findByKey(promptKey).isEmpty()) {
            return false;
        }
        addVersion(promptKey, content, note, true);
        return true;
    }

    public EvalPrompt addVersion(String promptKey, String content, String note, boolean activate) {
        int version = repo.nextVersion(promptKey);
        EvalPrompt p = EvalPrompt.builder()
                .id(UUID.randomUUID().toString())
                .promptKey(promptKey)
                .version(version)
                .content(content)
                .note(note)
                .active(activate)
                .createdAt(System.currentTimeMillis())
                .build();
        repo.insert(p);
        if (activate) {
            repo.activate(promptKey, version);
        }
        return p;
    }

    public List<EvalPrompt> listVersions(String promptKey) {
        return repo.findByKey(promptKey);
    }

    public void activate(String promptKey, int version) {
        repo.findByKeyAndVersion(promptKey, version)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "提示词版本不存在: " + promptKey + " v" + version));
        repo.activate(promptKey, version);
    }

    /** 解析跑批要用的提示词：指定版本优先，否则取 active。 */
    public Optional<EvalPrompt> resolve(String promptKey, Integer version) {
        if (promptKey == null || promptKey.isBlank()) {
            return Optional.empty();
        }
        if (version != null) {
            return Optional.of(repo.findByKeyAndVersion(promptKey, version).orElseThrow(
                    () -> new ResponseStatusException(NOT_FOUND, "提示词版本不存在: " + promptKey + " v" + version)));
        }
        return repo.findActive(promptKey);
    }
}
