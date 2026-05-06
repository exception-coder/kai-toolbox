package com.exceptioncoder.toolbox.mediaparser.parser;

import com.exceptioncoder.toolbox.mediaparser.domain.ParseResult;
import com.exceptioncoder.toolbox.mediaparser.domain.Platform;

import java.util.Set;

public interface PlatformParser {
    Set<Platform> supports();
    ParseResult parse(String url);
}
