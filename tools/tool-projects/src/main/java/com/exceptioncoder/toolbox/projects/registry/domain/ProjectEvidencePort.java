package com.exceptioncoder.toolbox.projects.registry.domain;

import java.util.List;
import java.util.Map;

/** 本机代码证据发现边界；实现不得执行项目声明的任意命令。 */
public interface ProjectEvidencePort {
    /** @param path 用户提供的目录 @return 存在且规范化的本机目录。 */
    String canonicalPath(String path);
    /** @param root 项目根 @return 当前有界源码清单与内容指纹。 */
    RepositorySnapshot scan(String root);
    /** @param root 项目根 @return Graphify 实际产物摘要。 */
    GraphEvidence graph(String root);
    /** @param root 项目根 @return 已安装 Graphify 的执行结果或明确缺口。 */
    String buildGraph(String root);
    /** @param root 项目根 @return 原生结构图增量更新摘要；失败抛异常且保留基线。 */
    String syncGraph(String root);
    /** @param root 项目根 @param snapshot 已发现文件 @return 五类画像资产。 */
    List<SystemProfile.Asset> assets(String root, RepositorySnapshot snapshot);

    /** 有界扫描结果，complete 为 false 时禁止宣称完整。 */
    record RepositorySnapshot(
            /** 内容指纹。 */ String fingerprint,
            /** 相关文件相对路径。 */ List<String> files,
            /** 是否覆盖全部扫描范围。 */ Boolean complete,
            /** 探测信息。 */ Map<String, String> facts
    ) { }

    /** Graphify 文件的结构与新鲜度摘要。 */
    record GraphEvidence(
            /** 是否存在可解析的代码图。 */ Boolean usable,
            /** 是否有覆盖当前输入的证据。 */ Boolean fresh,
            /** 实际图节点数量。 */ Integer nodes,
            /** 缺口说明。 */ String message
    ) { }
}
