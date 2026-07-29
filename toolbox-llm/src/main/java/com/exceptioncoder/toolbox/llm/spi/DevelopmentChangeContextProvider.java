package com.exceptioncoder.toolbox.llm.spi;

import java.util.List;

/**
 * 开发会话变更上下文的跨工具契约。
 *
 * <p>PRD 模块通过此 SPI 获取 Vibe Coding 的增量对话和 Git 变化，不直接依赖
 * tool-claude-chat 或读取其存储。其他代码引擎只需由会话工具统一适配到本契约。</p>
 */
public interface DevelopmentChangeContextProvider {

    DevelopmentChangeContext snapshot(String devSessionId, long afterSequence);

    record DevelopmentChangeContext(
            long fromSequence,
            long toSequence,
            List<ConversationEntry> conversation,
            List<GitRepositoryChange> repositories,
            String snapshotHash,
            List<String> warnings
    ) {
    }

    record ConversationEntry(long sequence, String role, String content) {
    }

    record GitRepositoryChange(
            String repository,
            List<String> changedFiles,
            String diff,
            boolean truncated,
            String error
    ) {
    }
}
