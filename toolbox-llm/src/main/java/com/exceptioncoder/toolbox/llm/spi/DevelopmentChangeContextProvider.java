package com.exceptioncoder.toolbox.llm.spi;

import java.util.List;
import java.util.Map;

/**
 * 开发会话变更上下文的跨工具契约。
 *
 * <p>PRD 模块通过此 SPI 获取 Vibe Coding 的增量对话和 Git 变化，不直接依赖
 * tool-claude-chat 或读取其存储。其他代码引擎只需由会话工具统一适配到本契约。</p>
 */
public interface DevelopmentChangeContextProvider {

    DevelopmentChangeContext snapshot(String devSessionId, long afterSequence);

    /**
     * 基于最近完成同步点采集开发事实。
     *
     * @param devSessionId 逻辑开发会话 ID
     * @param baseline     最近完成同步点；无基线时传空映射
     * @return 本次分析上下文
     */
    default DevelopmentChangeContext snapshot(String devSessionId, DevelopmentSyncPoint baseline) {
        return snapshot(devSessionId, baseline.conversationSequence());
    }

    record DevelopmentChangeContext(
            long fromSequence,
            long toSequence,
            List<ConversationEntry> conversation,
            List<GitRepositoryChange> repositories,
            String snapshotHash,
            List<String> warnings,
            AnalysisExecutionProfile executionProfile
    ) {
    }

    record ConversationEntry(long sequence, String role, String content) {
    }

    record GitRepositoryChange(
            String repositoryKey,
            String repository,
            String baseCommit,
            String headCommit,
            List<String> changedFiles,
            String diff,
            boolean truncated,
            String error
    ) {
    }

    /** 最近一次已完成文档同步对应的开发事实位置。 */
    record DevelopmentSyncPoint(long conversationSequence, Map<String, String> repositoryHeads) {
        public DevelopmentSyncPoint {
            repositoryHeads = repositoryHeads == null ? Map.of() : Map.copyOf(repositoryHeads);
        }
    }

    /** 当前 Vibe Coding 会话的一次性分析运行配置。 */
    record AnalysisExecutionProfile(
            String cwd,
            String engine,
            String model,
            String reasoningEffort,
            String speed,
            String apiBaseUrl,
            String authToken,
            String codexHome,
            String providerKind
    ) {
    }
}
