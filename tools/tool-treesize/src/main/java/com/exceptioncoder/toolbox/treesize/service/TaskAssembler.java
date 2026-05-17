package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.api.dto.TaskView;
import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;
import com.exceptioncoder.toolbox.treesize.domain.ScanStatus;
import com.exceptioncoder.toolbox.treesize.domain.SubtitleJob;
import com.exceptioncoder.toolbox.treesize.domain.SubtitleStatus;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Set;

/**
 * 把内部领域对象（SubtitleJob / ScanRecord）翻译成对外的 TaskView。
 * 阶段中文映射统一收口在这里，前端不再做一遍 enum→文案的映射。
 */
@Component
public class TaskAssembler {

    private static final Set<SubtitleStatus> SUBTITLE_ACTIVE = Set.of(
            SubtitleStatus.PENDING,
            SubtitleStatus.ANALYZING_AUDIO,
            SubtitleStatus.EXTRACTING_AUDIO,
            SubtitleStatus.TRANSCRIBING,
            SubtitleStatus.TRANSLATING
    );

    public TaskView from(SubtitleJob j) {
        String videoPath = j.getVideoPath();
        String title = videoPath == null ? j.getId() : lastSegment(videoPath);
        return new TaskView(
                j.getId(),
                "SUBTITLE",
                title,
                videoPath == null ? "" : videoPath,
                phaseOf(j.getStatus()),
                j.getStatus().name(),
                j.getProgress(),
                j.getErrorMsg(),
                j.getCreatedAt(),
                j.getStartedAt(),
                j.getFinishedAt(),
                SUBTITLE_ACTIVE.contains(j.getStatus()),
                j.getScanId(),
                videoPath
        );
    }

    public TaskView from(ScanRecord r) {
        String rootPath = r.getRootPath() == null ? "" : r.getRootPath();
        String title = rootPath.isEmpty() ? r.getId() : lastSegment(rootPath);
        String subtitle = (r.getSourceDisplayName() == null || r.getSourceDisplayName().isBlank())
                ? rootPath
                : r.getSourceDisplayName() + " · " + rootPath;
        // 扫描没有连续进度数（只有完成/未完成），前端按 indeterminate 渲染。
        double progress = r.getStatus() == ScanStatus.COMPLETED ? 1.0 : -1.0;
        return new TaskView(
                r.getId(),
                "SCAN",
                title,
                subtitle,
                phaseOf(r.getStatus()),
                r.getStatus().name(),
                progress,
                r.getErrorMsg(),
                r.getStartedAt(),
                r.getStartedAt(),
                r.getFinishedAt(),
                r.getStatus() == ScanStatus.RUNNING,
                r.getId(),
                null
        );
    }

    private static String phaseOf(SubtitleStatus s) {
        return switch (s) {
            case PENDING -> "排队中";
            case ANALYZING_AUDIO -> "分析音频";
            case EXTRACTING_AUDIO -> "抽取音轨";
            case TRANSCRIBING -> "转写";
            case TRANSLATING -> "翻译";
            case COMPLETED -> "已完成";
            case FAILED -> "失败";
            case CANCELLED -> "已取消";
        };
    }

    private static String phaseOf(ScanStatus s) {
        return switch (s) {
            case RUNNING -> "扫描中";
            case COMPLETED -> "已完成";
            case FAILED -> "失败";
            case CANCELLED -> "已取消";
        };
    }

    private static String lastSegment(String p) {
        try {
            Path path = Path.of(p);
            Path name = path.getFileName();
            return name == null ? p : name.toString();
        } catch (Exception e) {
            // 非法路径（远程 Linux 路径在 Windows JVM 上偶发）：按斜杠手动切一刀。
            int idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
            return idx >= 0 && idx < p.length() - 1 ? p.substring(idx + 1) : p;
        }
    }
}
