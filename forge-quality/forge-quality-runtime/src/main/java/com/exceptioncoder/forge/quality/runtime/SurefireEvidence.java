package com.exceptioncoder.forge.quality.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Element;

/** Reads only reports carrying this invocation's unpredictable suffix. */
record SurefireEvidence(long tests, long failures, long errors, long skipped) {
    static SurefireEvidence read(List<Path> modules, String suffix) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        long tests = 0, failures = 0, errors = 0, skipped = 0;
        for (Path module : modules) {
            Path reports = module.resolve("target/surefire-reports");
            if (!Files.isDirectory(reports)) {
                continue;
            }
            if (!reports.toRealPath().startsWith(module.toRealPath())) {
                throw new IllegalArgumentException("Test reports must remain within the module");
            }
            try (var paths = Files.newDirectoryStream(reports, "TEST-*-" + suffix + ".xml")) {
                for (Path report : paths) {
                    if (Files.isSymbolicLink(report) || Files.size(report) > 16 * 1024 * 1024) {
                        throw new IllegalArgumentException("Invalid test report");
                    }
                    Element suite = factory.newDocumentBuilder().parse(report.toFile()).getDocumentElement();
                    if (!"testsuite".equals(suite.getTagName())) {
                        throw new IllegalArgumentException("Expected Surefire testsuite");
                    }
                    tests += count(suite, "tests");
                    failures += count(suite, "failures");
                    errors += count(suite, "errors");
                    skipped += count(suite, "skipped");
                }
            }
        }
        if (tests < skipped || failures + errors > tests) {
            throw new IllegalArgumentException("Inconsistent test counts");
        }
        return new SurefireEvidence(tests, failures, errors, skipped);
    }

    private static long count(Element suite, String name) {
        long value = Long.parseLong(suite.getAttribute(name));
        if (value < 0) {
            throw new IllegalArgumentException("Negative test count");
        }
        return value;
    }

    boolean passed() {
        return tests > skipped && failures == 0 && errors == 0;
    }
}
