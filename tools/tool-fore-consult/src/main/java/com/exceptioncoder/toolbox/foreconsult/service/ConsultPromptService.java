package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultPrompt;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultPromptRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * 提示词版本管理：只追加，不原地改。
 *
 * <p>与 tool-eval 的 EvalPromptService 形状一致，但刻意各存各的表：口径的事实源必须在被测系统这边，
 * 让生产链路反过来读评测工具的表会把评测变成线上依赖。
 */
@Service
public class ConsultPromptService {

    private final ConsultPromptRepository repo;

    public ConsultPromptService(ConsultPromptRepository repo) {
        this.repo = repo;
    }

    /** 该 key 尚无任何版本时植入 v1 并激活；已存在则原样返回 false，不覆盖运行期资产。 */
    @Transactional
    public boolean seedIfAbsent(String promptKey, String content, String note) {
        if (!repo.findByKey(promptKey).isEmpty()) {
            return false;
        }
        addVersion(promptKey, content, note, true);
        return true;
    }

    @Transactional
    public ConsultPrompt addVersion(String promptKey, String content, String note, boolean activate) {
        int version = repo.nextVersion(promptKey);
        ConsultPrompt p = ConsultPrompt.builder()
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

    public List<ConsultPrompt> listVersions(String promptKey) {
        return repo.findByKey(promptKey);
    }

    @Transactional
    public void activate(String promptKey, int version) {
        repo.findByKeyAndVersion(promptKey, version).orElseThrow(
                () -> new ResponseStatusException(NOT_FOUND, "提示词版本不存在: " + promptKey + " v" + version));
        repo.activate(promptKey, version);
    }

    /** 解析本次要用的提示词：指定版本优先（重放场景），否则取 active（线上场景）。 */
    public Optional<ConsultPrompt> resolve(String promptKey, Integer version) {
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
