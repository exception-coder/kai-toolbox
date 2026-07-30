package com.exceptioncoder.toolbox.prdclarify.domain;

import java.util.Map;

/** 最近一次已完成文档同步对应的会话与代码位置。 */
public record PrdDocChangeBaseline(
        String prdSessionId,
        String devSessionId,
        long conversationSequence,
        Map<String, String> repositoryHeads,
        String workspaceSnapshotHash,
        String prdHash,
        String tddHash,
        long updatedAt
) {
}
