package com.exceptioncoder.toolbox.treesize.domain;

/** A file row from {@code treesize_node} joined with its scan's root path, used by the video library. */
public record VideoFile(String scanId, String rootPath, String path, String name, long size) {}
