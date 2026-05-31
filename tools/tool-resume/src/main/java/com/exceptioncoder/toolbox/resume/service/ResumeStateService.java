package com.exceptioncoder.toolbox.resume.service;

import com.exceptioncoder.toolbox.resume.repository.ResumeKvRepository;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Optional;

/**
 * 简历状态业务编排：薄一层校验 + 委派给 KV 仓储。
 *
 * <p>本期对 valueJson 不做字段级解析（前端 schema 演进很频繁，后端做 schema 校验只会带来双边修改），
 * 仅校验非空与上限大小（防止前端 bug 把整个 dataURL 头像写入导致 SQLite 行膨胀）。
 */
@Service
public class ResumeStateService {

    /** 单条 value 上限 2MB，足够覆盖含 base64 头像的简历完整 JSON；超限说明前端逻辑异常 */
    private static final int MAX_VALUE_BYTES = 2 * 1024 * 1024;

    public static final String KEY_STATE = "state";
    public static final String KEY_JOB_TARGET = "jobTarget";

    private final ResumeKvRepository repository;

    public ResumeStateService(ResumeKvRepository repository) {
        this.repository = repository;
    }

    public Optional<String> getState() {
        return repository.findValue(KEY_STATE);
    }

    public void saveState(String valueJson) {
        validate(valueJson, "state");
        repository.upsert(KEY_STATE, valueJson);
    }

    public Optional<String> getJobTarget() {
        return repository.findValue(KEY_JOB_TARGET);
    }

    public void saveJobTarget(String valueJson) {
        validate(valueJson, "jobTarget");
        repository.upsert(KEY_JOB_TARGET, valueJson);
    }

    private void validate(String json, String keyName) {
        if (!StringUtils.hasText(json)) {
            throw new IllegalArgumentException(keyName + " 不能为空");
        }
        if (json.length() > MAX_VALUE_BYTES) {
            throw new IllegalArgumentException(keyName + " 超出大小上限（" + MAX_VALUE_BYTES + " 字符）");
        }
    }
}
