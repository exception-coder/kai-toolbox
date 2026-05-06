package com.exceptioncoder.toolbox.treesize.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Binds {@code toolbox.video.*} from application.yml. The defaults live in application.yml,
 * not in code, so users can edit a single yaml entry to add/remove file types they want
 * recognised as videos in the TreeSize click-to-play UI.
 */
@ConfigurationProperties(prefix = "toolbox.video")
public class VideoExtensionsProperties {
    private List<String> extensions = List.of();

    public List<String> getExtensions() { return extensions; }
    public void setExtensions(List<String> extensions) { this.extensions = extensions; }
}
