package com.exceptioncoder.toolbox.claudechat.service.changes;

import java.util.List;
import java.util.Map;

/** 平台轮次身份下的 Git 观察记录；不宣称共享工作区修改的作者归属。 */
public record TurnChangeRecord(String turnId, long startedAt, Long endedAt, String stopReason,
                               String state, List<RepositoryChange> repositories, List<String> warnings) {
    /** 不保存文件正文，只有路径、状态及基线指纹。 */
    public record RepositoryChange(String selection, String label, String root, String beforeHead, String afterHead,
                                    Map<String, FileStamp> baseline, List<FileChange> files) { }
    /** 基线文件内容摘要；大文件或链接未采集时不伪造摘要。 */
    public record FileStamp(String digest, String status, String originalPath) { }
    /** 一条观察到的文件变化；来源为工作区或提交区间。 */
    public record FileChange(String path, String originalPath, String status, String source) { }
}
