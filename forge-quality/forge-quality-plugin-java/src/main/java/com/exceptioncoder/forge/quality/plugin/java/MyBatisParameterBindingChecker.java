package com.exceptioncoder.forge.quality.plugin.java;

import com.exceptioncoder.forge.quality.core.ChangeSet;
import com.exceptioncoder.forge.quality.core.Finding;
import com.exceptioncoder.forge.quality.core.QualityChecker;
import com.exceptioncoder.forge.quality.core.Severity;
import com.exceptioncoder.forge.quality.core.StackCapability;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Validates root parameter bindings between MyBatis mapper methods and XML statements. */
final class MyBatisParameterBindingChecker implements QualityChecker {
    private static final Pattern PLACEHOLDER = Pattern.compile("#\\{\\s*([A-Za-z_$][\\w$]*)(?:[.\\s,}])");
    private static final Pattern PARAM_ANNOTATION = Pattern.compile("@Param\\s*\\(\\s*\"([^\"]+)\"\\s*\\)");

    @Override
    public String id() {
        return "MYBATIS-001";
    }

    @Override
    public String domain() {
        return "Persistence Mapping Integrity";
    }

    @Override
    public Set<String> requiredCapabilities() {
        return Set.of("persistence.mybatis");
    }

    @Override
    public List<Finding> check(ChangeSet changeSet, List<StackCapability> capabilities) {
        List<Finding> findings = new ArrayList<>();
        for (Path xml : changeSet.files().stream().filter(MyBatisParameterBindingChecker::isMapperXml).toList()) {
            checkMapperXml(changeSet, xml, findings);
        }
        return findings;
    }

    private static void checkMapperXml(ChangeSet changeSet, Path xml, List<Finding> findings) {
        try {
            Document document = parseSecurely(Files.readString(xml));
            String namespace = document.getDocumentElement().getAttribute("namespace");
            Path mapperJava = findMapperJava(changeSet, namespace);
            if (mapperJava == null) {
                findings.add(new Finding("MYBATIS-001", Severity.WARNING,
                        "Mapper interface was not found for namespace " + namespace,
                        changeSet.relativePath(xml), null, "namespace=" + namespace));
                return;
            }
            String javaSource = Files.readString(mapperJava);
            inspectStatements(changeSet, xml, document, mapperJava, javaSource, findings);
        } catch (Exception exception) {
            findings.add(new Finding("MYBATIS-001", Severity.ERROR,
                    "Mapper XML could not be validated: " + exception.getMessage(),
                    changeSet.relativePath(xml), null, exception.getClass().getSimpleName()));
        }
    }

    private static void inspectStatements(ChangeSet changeSet, Path xml, Document document, Path mapperJava,
                                          String javaSource, List<Finding> findings) {
        for (String tag : List.of("select", "insert", "update", "delete")) {
            NodeList statements = document.getElementsByTagName(tag);
            for (int index = 0; index < statements.getLength(); index++) {
                Element statement = (Element) statements.item(index);
                String methodName = statement.getAttribute("id");
                Set<String> roots = placeholderRoots(statement.getTextContent());
                if (!roots.isEmpty()) {
                    validateMethod(changeSet, xml, mapperJava, javaSource, methodName, roots, findings);
                }
            }
        }
    }

    private static void validateMethod(ChangeSet changeSet, Path xml, Path mapperJava, String javaSource,
                                       String methodName, Set<String> roots, List<Finding> findings) {
        Pattern methodPattern = Pattern.compile("\\b" + Pattern.quote(methodName)
                + "\\s*\\(((?:[^()]|\\([^()]*\\))*)\\)");
        Matcher methodMatcher = methodPattern.matcher(javaSource);
        if (!methodMatcher.find()) {
            findings.add(new Finding("MYBATIS-001", Severity.ERROR,
                    "XML statement has no matching mapper method: " + methodName,
                    changeSet.relativePath(xml), null, "mapper=" + changeSet.relativePath(mapperJava)));
            return;
        }
        ParameterContract contract = parseParameters(methodMatcher.group(1));
        if (contract.acceptsArbitraryProperty()) {
            return;
        }
        for (String root : roots) {
            if (!contract.names().contains(root) && !root.equals("_parameter") && !root.equals("value")) {
                findings.add(new Finding("MYBATIS-001", Severity.ERROR,
                        "Unbound MyBatis parameter '#{" + root + "}' in statement " + methodName,
                        changeSet.relativePath(xml), null,
                        "available=" + contract.names() + ", mapper=" + changeSet.relativePath(mapperJava)));
            }
        }
    }

    private static ParameterContract parseParameters(String declaration) {
        if (declaration.isBlank()) {
            return new ParameterContract(Set.of(), false);
        }
        String[] parameters = declaration.split(",");
        Set<String> names = new HashSet<>();
        for (String parameter : parameters) {
            Matcher annotation = PARAM_ANNOTATION.matcher(parameter);
            if (annotation.find()) {
                names.add(annotation.group(1));
            } else {
                String clean = parameter.replaceAll("@[A-Za-z_$][\\w$]*(?:\\([^)]*\\))?", " ").trim();
                String[] tokens = clean.split("\\s+");
                names.add(tokens[tokens.length - 1].replace("...", ""));
            }
        }
        boolean arbitraryProperty = parameters.length == 1 && !isSimpleParameter(parameters[0]);
        return new ParameterContract(names, arbitraryProperty);
    }

    private static boolean isSimpleParameter(String parameter) {
        return parameter.matches(".*\\b(String|Integer|Long|Short|Byte|Boolean|Double|Float|BigDecimal|UUID|int|long|boolean)\\b.*");
    }

    private static Set<String> placeholderRoots(String sql) {
        Set<String> roots = new HashSet<>();
        Matcher matcher = PLACEHOLDER.matcher(sql + " ");
        while (matcher.find()) {
            roots.add(matcher.group(1));
        }
        return roots;
    }

    private static Path findMapperJava(ChangeSet changeSet, String namespace) {
        String expected = namespace.replace('.', '/') + ".java";
        return changeSet.files().stream()
                .filter(path -> path.toString().replace('\\', '/').endsWith(expected))
                .findFirst().orElse(null);
    }

    private static boolean isMapperXml(Path path) {
        if (!path.toString().endsWith(".xml")) {
            return false;
        }
        try {
            String prefix = Files.readString(path);
            return prefix.contains("<mapper") && prefix.contains("namespace=");
        } catch (IOException exception) {
            return false;
        }
    }

    private static Document parseSecurely(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", false);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
    }

    private record ParameterContract(Set<String> names, boolean acceptsArbitraryProperty) {
        private ParameterContract {
            names = Set.copyOf(names);
        }
    }
}
