package com.exceptioncoder.toolbox.docker.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 远程主机上的 Docker 应用条目：主机 + 应用根目录 + compose 文件 的绑定。
 * 唯一键 = (host_id, base_dir)。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DockerApp {
    private String id;
    private String hostId;
    private String name;
    private String baseDir;
    private String composeFile;
    private String note;
    private long createdAt;
    private long updatedAt;
}
