package com.exceptioncoder.toolbox.projects.registry.domain;

import java.util.List;
import java.util.Optional;

/** 系统聚合持久化端口；初始化领取与画像发布必须原子完成。 */
public interface ProjectRegistryStore {
    /** @return 已登记项目，限制为本机单用户项目库规模。 */
    List<RegistryProject> projects();
    /** @param id 系统标识 @return 已登记项目。 */
    Optional<RegistryProject> project(String id);
    /** @param project 新系统身份，规范化目录必须唯一。 */
    void insert(RegistryProject project);
    /** @param project 修改后的基础信息。 */
    void update(RegistryProject project);
    /** @param projectId 系统标识 @param version 已检查版本，避免覆盖并发初始化。 */
    void markSyncRequired(String projectId, int version);
    /** @param projectId 系统标识 @param version 画像版本 @return 对应快照。 */
    Optional<SystemProfile> profile(String projectId, int version);
    /** @param projectId 系统标识 @return 最近二十次初始化。 */
    List<SystemInitRun> runs(String projectId);
    /** @param run 待领取运行 @throws IllegalStateException 已存在活动运行。 */
    void claim(SystemInitRun run);
    /** @param run 阶段状态快照。 */
    void saveRun(SystemInitRun run);
    /** @param run 已完成运行 @param profile 待发布快照。 */
    void publish(SystemInitRun run, SystemProfile profile);
    /** @param run 失败运行，保留已发布画像。 */
    void fail(SystemInitRun run);
    /** 将上次进程遗留的活动运行转为可恢复失败。 */
    void recoverInterrupted();
    /** @param task 绑定已有需求池任务。 */
    void bindTask(SystemTaskBinding task);
    /** @param projectId 系统标识 @return 最近一百条任务绑定。 */
    List<SystemTaskBinding> tasks(String projectId);
    /** @param projectId 系统标识 @param taskId 需求标识 @return 对应绑定，不受列表窗口限制。 */
    Optional<SystemTaskBinding> task(String projectId, String taskId);
}
