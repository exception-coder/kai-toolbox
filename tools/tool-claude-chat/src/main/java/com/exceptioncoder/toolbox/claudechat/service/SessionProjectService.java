package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.springframework.stereotype.Service;

/**
 * 会话项目应用服务，集中处理项目级批量操作规则。
 */
@Service
public class SessionProjectService {

    private final ClaudeChatSessionRepository sessionRepository;

    public SessionProjectService(ClaudeChatSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    /**
     * 原子重命名项目下全部会话，需求子分组保持不变。
     *
     * @param oldName 当前项目名称
     * @param newName 新项目名称
     * @return 重命名结果
     */
    public RenameResult rename(String oldName, String newName) {
        String source = normalize(oldName);
        String target = normalize(newName);
        if (source == null || target == null) {
            return RenameResult.INVALID_NAME;
        }
        if (!sessionRepository.groupExists(source)) {
            return RenameResult.SOURCE_NOT_FOUND;
        }
        if (source.equals(target)) {
            return RenameResult.UNCHANGED;
        }
        if (sessionRepository.groupExists(target)) {
            return RenameResult.TARGET_EXISTS;
        }
        sessionRepository.renameGroup(source, target);
        return RenameResult.RENAMED;
    }

    private String normalize(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        return name.trim();
    }

    /** 项目重命名的完整业务结果。 */
    public enum RenameResult {
        /** 已完成批量重命名。 */
        RENAMED,
        /** 规范化后名称没有变化。 */
        UNCHANGED,
        /** 原名称或新名称为空。 */
        INVALID_NAME,
        /** 原项目不存在。 */
        SOURCE_NOT_FOUND,
        /** 目标项目已存在。 */
        TARGET_EXISTS
    }
}

