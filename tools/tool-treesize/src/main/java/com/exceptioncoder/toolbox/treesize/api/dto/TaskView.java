package com.exceptioncoder.toolbox.treesize.api.dto;

/**
 * 任务中心模块统一对外暴露的任务行结构。把字幕作业（SubtitleJob）与目录扫描（ScanRecord）
 * 折叠成同一种行模型，前端不用做 type 分支也能渲染基本字段。
 *
 * <p>{@code type} 决定可执行的动作：
 * <ul>
 *   <li>{@code SUBTITLE} — 字幕作业；终态有 vttPath 时前端跳视频库播放；运行中可取消</li>
 *   <li>{@code SCAN} — 目录扫描；任何状态都只支持删除（现有 DELETE 接口含取消语义）</li>
 * </ul>
 */
public record TaskView(
        String id,
        /** "SUBTITLE" 或 "SCAN" */
        String type,
        /** 任务一句话标题：字幕用视频文件名，扫描用根目录最后一段 */
        String title,
        /** 副标题：字幕用完整视频路径，扫描用「源名称 · 根路径」 */
        String subtitle,
        /** 中文阶段：「分析音频」「抽取音轨」「转写」「翻译」「扫描中」「已完成」等 */
        String phase,
        /** 原 enum 名（SubtitleStatus / ScanStatus），前端可据此选 badge variant */
        String status,
        /** 0.0 ~ 1.0；扫描没有连续进度时为 -1（前端按 indeterminate 渲染） */
        double progress,
        String errorMsg,
        long createdAt,
        Long startedAt,
        Long finishedAt,
        /** 是否仍在跑（非终态） */
        boolean active,
        /** 字幕：关联的 scanId；扫描：自身 id（前端「打开扫描」时跳过去） */
        String scanId,
        /** 字幕才有；扫描为 null */
        String videoPath
) {}
