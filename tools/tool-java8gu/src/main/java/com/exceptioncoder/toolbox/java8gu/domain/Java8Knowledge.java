package com.exceptioncoder.toolbox.java8gu.domain;

import java.util.List;

/** Java 8 知识库的稳定传输模型。 */
public final class Java8Knowledge {

    private Java8Knowledge() {
    }

    /** 知识节点。 */
    public record Node(String id, String title, String summary, String content, String nodeType,
                       Integer level, String parentId, Integer sortOrder) {
    }

    /** 带子节点的导航树节点。 */
    public record TreeNode(String id, String title, String summary, String nodeType, Integer level,
                           List<TreeNode> children) {
    }

    /** 重构前后代码案例。 */
    public record Example(Long id, String nodeId, String title, String beforeCode, String afterCode,
                          String explanation) {
    }

    /** 面试回答卡片。 */
    public record Interview(Long id, String nodeId, String question, String shortAnswer,
                            String detailAnswer, String projectAnswer) {
    }

    /** 关联节点。 */
    public record Relation(Long id, String relationType, String direction, Node node) {
    }

    /** 阅读页聚合。 */
    public record Detail(Node node, List<Example> examples, List<Interview> interviews) {
    }
}
