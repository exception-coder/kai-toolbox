package com.exceptioncoder.toolbox.resume.api.dto;

/**
 * 简历 KV 返回视图。{@code valueJson} 为 null 表示后端尚无数据，前端按"首次启动"处理。
 */
public record ResumeKvView(String valueJson) {

    public static ResumeKvView empty() {
        return new ResumeKvView(null);
    }
}
