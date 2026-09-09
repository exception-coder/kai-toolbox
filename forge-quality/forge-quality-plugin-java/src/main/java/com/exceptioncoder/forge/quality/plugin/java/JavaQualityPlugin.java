package com.exceptioncoder.forge.quality.plugin.java;

import com.exceptioncoder.forge.quality.core.QualityChecker;
import com.exceptioncoder.forge.quality.core.QualityPlugin;
import com.exceptioncoder.forge.quality.core.StackDetector;

import java.util.List;

/** Java ecosystem quality plugin. */
public final class JavaQualityPlugin implements QualityPlugin {
    @Override
    public String id() {
        return "forge-quality-java";
    }

    @Override
    public List<StackDetector> detectors() {
        return List.of(new JavaStackDetector());
    }

    @Override
    public List<QualityChecker> checkers() {
        return List.of(new MyBatisParameterBindingChecker());
    }
}
