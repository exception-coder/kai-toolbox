package com.exceptioncoder.toolbox.scripts.leadexport;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 国内询盘表清洗脚本: 将源 Excel 按目标客户字段导出为新工作簿。
 */
public final class LeadExcelExporter {

    private static final Path DEFAULT_INPUT = Path.of(
            "C:\\Users\\zhang\\Downloads\\市场部询盘表（国内+国外）_🇨🇳国内询盘数据.xlsx");
    private static final Path DEFAULT_ADDRESS = Path.of(
            "D:\\yoooni\\yoooniCodeSpace\\yoooni\\out\\artifacts\\yoooni_Web_exploded\\public\\province_city_area\\province_city_area.json");
    private static final Path DEFAULT_OUTPUT = Path.of("target\\domestic-leads-export.xlsx");
    private static final String FIXED_REGION = "广东区域";
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();
    private static final Pattern PHONE_PATTERN = Pattern.compile(
            "(?<![\\d+])((?:\\+|00)\\d{1,4}[-\\s]?(?:\\d[-\\s]?){6,12}\\d)(?!\\d)"
                    + "|(?<!\\d)((?:\\+?86[-\\s]?)?1[3-9]\\d[-\\s]?\\d{4}[-\\s]?\\d{4})(?!\\d)"
                    + "|(?<!\\d)((?:0\\d{2,3}[-\\s]?)?\\d{7,8})(?!\\d)");

    private static final List<String> OUTPUT_HEADERS = List.of(
            "公司(品牌)名称",
            "业务员(开发人)",
            "客户关键字",
            "客户类别",
            "所属区域",
            "经营大类",
            "客户类型",
            "客户地址",
            "线索来源",
            "品牌名",
            "联系人姓名",
            "手机",
            "省",
            "市",
            "区",
            "客户状态",
            "询盘内容",
            "备注"
    );

    private LeadExcelExporter() {
    }

    /**
     * 执行 Excel 导出。
     *
     * @param args 支持 --input、--address、--output、--sheet 参数
     * @throws Exception 文件读取或写入失败时抛出
     */
    public static void main(String[] args) throws Exception {
        ExportOptions options = ExportOptions.from(args);
        AddressResolver addressResolver = AddressResolver.load(options.addressPath());

        try (InputStream inputStream = Files.newInputStream(options.inputPath());
             Workbook sourceWorkbook = WorkbookFactory.create(inputStream);
             XSSFWorkbook targetWorkbook = new XSSFWorkbook()) {
            Sheet sourceSheet = selectSheet(sourceWorkbook, options.sheetName());
            FormulaEvaluator evaluator = sourceWorkbook.getCreationHelper().createFormulaEvaluator();
            DataFormatter formatter = new DataFormatter(Locale.CHINA);
            Map<String, Integer> headerIndex = readHeaderIndex(sourceSheet, formatter, evaluator);
            LlmPhoneCorrector phoneCorrector = LlmPhoneCorrector.fromEnvironment();
            List<TargetLead> leads = readLeads(sourceSheet, formatter, evaluator, headerIndex, addressResolver,
                    phoneCorrector);
            LlmRejectionFilter llmFilter = LlmRejectionFilter.fromEnvironment();

            writeTargetWorkbook(targetWorkbook, leads);
            writeFilteredTargetWorkbook(targetWorkbook, leads);
            writeLlmFilteredTargetWorkbook(targetWorkbook, leads, llmFilter);
            writeEnumAuditSheet(targetWorkbook, leads);
            writeWorkbook(targetWorkbook, options.outputPath());

            System.out.printf("导出完成: %s, 共 %d 行%n", options.outputPath().toAbsolutePath(), leads.size());
        }
    }

    private static Sheet selectSheet(Workbook workbook, String sheetName) {
        if (sheetName != null && !sheetName.isBlank()) {
            Sheet sheet = workbook.getSheet(sheetName);
            if (sheet == null) {
                throw new IllegalArgumentException("找不到工作表: " + sheetName);
            }
            return sheet;
        }
        return workbook.getSheetAt(0);
    }

    private static Map<String, Integer> readHeaderIndex(
            Sheet sheet,
            DataFormatter formatter,
            FormulaEvaluator evaluator
    ) {
        Row headerRow = sheet.getRow(sheet.getFirstRowNum());
        if (headerRow == null) {
            throw new IllegalArgumentException("源 Excel 第一行为空，无法识别表头");
        }

        Map<String, Integer> headerIndex = new HashMap<>();
        for (Cell cell : headerRow) {
            String header = normalizeHeader(readCell(cell, formatter, evaluator));
            if (!header.isBlank()) {
                headerIndex.put(header, cell.getColumnIndex());
            }
        }
        return headerIndex;
    }

    private static List<TargetLead> readLeads(
            Sheet sheet,
            DataFormatter formatter,
            FormulaEvaluator evaluator,
            Map<String, Integer> headerIndex,
            AddressResolver addressResolver,
            LlmPhoneCorrector phoneCorrector
    ) {
        SourceColumns columns = SourceColumns.from(headerIndex);
        List<TargetLead> leads = new ArrayList<>();
        for (int rowIndex = sheet.getFirstRowNum() + 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
            Row row = sheet.getRow(rowIndex);
            if (row == null) {
                continue;
            }

            SourceLead sourceLead = columns.read(row, formatter, evaluator);
            if (sourceLead.isBlank()) {
                continue;
            }
            if (!sourceLead.hasContactInfo()) {
                continue;
            }

            Contact contact = phoneCorrector.correct(sourceLead.contactText(), Contact.parse(sourceLead.contactText()));
            AddressParts addressParts = addressResolver.resolve(sourceLead.address()).orElse(AddressParts.empty());
            leads.add(TargetLead.from(sourceLead, contact, addressParts));
        }
        return leads;
    }

    private static void writeTargetWorkbook(XSSFWorkbook workbook, List<TargetLead> leads) {
        writeLeadsSheet(workbook, "目标客户数据", leads);
    }

    private static void writeFilteredTargetWorkbook(XSSFWorkbook workbook, List<TargetLead> leads) {
        writeLeadsSheet(workbook, "过滤后客户数据", filterLeadsWithMobile(leads));
    }

    private static void writeLlmFilteredTargetWorkbook(
            XSSFWorkbook workbook,
            List<TargetLead> leads,
            LlmRejectionFilter llmFilter
    ) {
        List<TargetLead> filteredLeads = filterLeadsWithMobile(leads).stream()
                .filter(lead -> !llmFilter.isRejected(lead))
                .toList();
        writeLeadsSheet(workbook, "LLM过滤后客户数据", filteredLeads);
    }

    private static List<TargetLead> filterLeadsWithMobile(List<TargetLead> leads) {
        return leads.stream()
                .filter(lead -> !lead.mobile().isBlank())
                .toList();
    }

    private static void writeLeadsSheet(XSSFWorkbook workbook, String sheetName, List<TargetLead> leads) {
        Sheet sheet = workbook.createSheet(sheetName);
        CellStyle textStyle = workbook.createCellStyle();
        textStyle.setWrapText(true);

        Row headerRow = sheet.createRow(0);
        for (int i = 0; i < OUTPUT_HEADERS.size(); i++) {
            headerRow.createCell(i).setCellValue(OUTPUT_HEADERS.get(i));
        }

        for (int i = 0; i < leads.size(); i++) {
            Row row = sheet.createRow(i + 1);
            List<String> values = leads.get(i).toRow();
            for (int j = 0; j < values.size(); j++) {
                Cell cell = row.createCell(j);
                cell.setCellStyle(textStyle);
                cell.setCellValue(values.get(j));
            }
        }

        for (int i = 0; i < OUTPUT_HEADERS.size(); i++) {
            sheet.autoSizeColumn(i);
            int currentWidth = sheet.getColumnWidth(i);
            int cappedWidth = Math.min(Math.max(currentWidth, 12 * 256), 32 * 256);
            sheet.setColumnWidth(i, cappedWidth);
        }
    }

    private static void writeEnumAuditSheet(XSSFWorkbook workbook, List<TargetLead> leads) {
        Sheet sheet = workbook.createSheet("枚举识别明细");
        List<EnumAuditRow> rows = collectEnumAuditRows(leads);

        Row headerRow = sheet.createRow(0);
        headerRow.createCell(0).setCellValue("原始客户类型");
        headerRow.createCell(1).setCellValue("出现次数");
        headerRow.createCell(2).setCellValue("客户类别命中");
        headerRow.createCell(3).setCellValue("经营大类命中");
        headerRow.createCell(4).setCellValue("客户类型命中");
        headerRow.createCell(5).setCellValue("待登记字段");

        for (int i = 0; i < rows.size(); i++) {
            EnumAuditRow row = rows.get(i);
            Row sheetRow = sheet.createRow(i + 1);
            sheetRow.createCell(0).setCellValue(row.sourceValue());
            sheetRow.createCell(1).setCellValue(row.count());
            sheetRow.createCell(2).setCellValue(row.customerCategory());
            sheetRow.createCell(3).setCellValue(row.businessCategory());
            sheetRow.createCell(4).setCellValue(row.customerType());
            sheetRow.createCell(5).setCellValue(row.pendingFields());
        }

        for (int i = 0; i < 6; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private static List<EnumAuditRow> collectEnumAuditRows(List<TargetLead> leads) {
        Map<String, EnumAuditAccumulator> stats = new HashMap<>();
        for (TargetLead lead : leads) {
            String sourceCustomerType = lead.sourceCustomerTypeText();
            if (sourceCustomerType.isBlank()) {
                continue;
            }
            stats.computeIfAbsent(sourceCustomerType, EnumAuditAccumulator::new).add(lead);
        }

        return stats.values().stream()
                .map(EnumAuditAccumulator::toRow)
                .sorted(Comparator.comparing((EnumAuditRow row) -> row.pendingFields().isBlank())
                        .thenComparing(EnumAuditRow::count, Comparator.reverseOrder())
                        .thenComparing(EnumAuditRow::sourceValue))
                .toList();
    }

    private static void writeWorkbook(Workbook workbook, Path outputPath) throws IOException {
        Path parent = outputPath.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        try (OutputStream outputStream = Files.newOutputStream(outputPath)) {
            workbook.write(outputStream);
        }
    }

    private static String readCell(Cell cell, DataFormatter formatter, FormulaEvaluator evaluator) {
        if (cell == null) {
            return "";
        }
        return formatter.formatCellValue(cell, evaluator).trim();
    }

    private static String normalizeHeader(String value) {
        return normalizeText(value)
                .replace("（", "(")
                .replace("）", ")")
                .replaceAll("[\\s()（）/\\\\_\\-]", "");
    }

    private static String normalizeText(String value) {
        if (value == null) {
            return "";
        }
        return value.trim()
                .replace('\u00A0', ' ')
                .replaceAll("\\s+", " ");
    }

    private static String normalizeAreaName(String value) {
        return normalizeText(value)
                .replaceAll("(壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市|地区|盟|自治州|区|县)$", "");
    }

    private static List<String> extractByRules(String text, LinkedHashMap<String, List<String>> rules) {
        String normalized = normalizeText(text);
        if (normalized.isBlank()) {
            return List.of();
        }

        List<String> result = new ArrayList<>();
        for (Map.Entry<String, List<String>> entry : rules.entrySet()) {
            for (String keyword : entry.getValue()) {
                if (normalized.contains(keyword)) {
                    result.add(entry.getKey());
                    break;
                }
            }
        }
        return result;
    }

    private record ExportOptions(Path inputPath, Path addressPath, Path outputPath, String sheetName) {

        static ExportOptions from(String[] args) {
            Map<String, String> options = parseArgs(args);
            return new ExportOptions(
                    Path.of(options.getOrDefault("input", DEFAULT_INPUT.toString())),
                    Path.of(options.getOrDefault("address", DEFAULT_ADDRESS.toString())),
                    Path.of(options.getOrDefault("output", DEFAULT_OUTPUT.toString())),
                    options.get("sheet")
            );
        }

        private static Map<String, String> parseArgs(String[] args) {
            Map<String, String> options = new HashMap<>();
            for (int i = 0; i < args.length; i++) {
                String arg = args[i];
                if (!arg.startsWith("--")) {
                    continue;
                }

                String key = arg.substring(2);
                if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
                    throw new IllegalArgumentException("参数缺少值: " + arg);
                }
                options.put(key, args[++i]);
            }
            return options;
        }
    }

    private record SourceColumns(
            int company,
            int developer,
            int customerType,
            int address,
            int channel,
            int contact,
            int customerStatus,
            int inquiryContent,
            int consultingSeries,
            int productColorCode,
            int followUpFeedback
    ) {

        static SourceColumns from(Map<String, Integer> headerIndex) {
            return new SourceColumns(
                    findColumn(headerIndex, "公司名称"),
                    findColumn(headerIndex, "跟进业务员", "业务员", "开发人"),
                    findColumn(headerIndex, "客户类型"),
                    findColumn(headerIndex, "地区", "客户地址", "地址"),
                    findColumn(headerIndex, "渠道", "线索来源"),
                    findColumn(headerIndex, "联系方式含客户名称", "联系方式", "联系人"),
                    findColumn(headerIndex, "客户状态"),
                    findColumn(headerIndex, "询盘内容"),
                    findColumn(headerIndex, "咨询系列"),
                    findColumn(headerIndex, "咨询产品色号"),
                    findColumn(headerIndex, "跟进反馈")
            );
        }

        SourceLead read(Row row, DataFormatter formatter, FormulaEvaluator evaluator) {
            return new SourceLead(
                    readCell(row.getCell(company), formatter, evaluator),
                    readCell(row.getCell(developer), formatter, evaluator),
                    readCell(row.getCell(customerType), formatter, evaluator),
                    readCell(row.getCell(address), formatter, evaluator),
                    readCell(row.getCell(channel), formatter, evaluator),
                    readCell(row.getCell(contact), formatter, evaluator),
                    readCell(row.getCell(customerStatus), formatter, evaluator),
                    readCell(row.getCell(inquiryContent), formatter, evaluator),
                    readCell(row.getCell(consultingSeries), formatter, evaluator),
                    readCell(row.getCell(productColorCode), formatter, evaluator),
                    readCell(row.getCell(followUpFeedback), formatter, evaluator)
            );
        }

        private static int findColumn(Map<String, Integer> headerIndex, String... aliases) {
            for (String alias : aliases) {
                Integer column = headerIndex.get(normalizeHeader(alias));
                if (column != null) {
                    return column;
                }
            }
            throw new IllegalArgumentException("源 Excel 缺少列: " + String.join("/", aliases));
        }
    }

    private record SourceLead(
            String company,
            String developer,
            String customerTypeText,
            String address,
            String channel,
            String contactText,
            String customerStatus,
            String inquiryContent,
            String consultingSeries,
            String productColorCode,
            String followUpFeedback
    ) {

      boolean isBlank() {
          return StreamText.allBlank(company, developer, customerTypeText, address, channel, contactText,
                  customerStatus, inquiryContent, consultingSeries, productColorCode, followUpFeedback);
      }

      boolean hasContactInfo() {
          return !normalizeText(contactText).isBlank();
      }
  }

    private record TargetLead(
            String company,
            String developer,
            String keyword,
            String customerCategory,
            String region,
            String businessCategory,
            String customerType,
            String address,
            String channel,
            String brand,
            String contactName,
            String mobile,
            String province,
            String city,
            String area,
            String customerStatus,
            String inquiryContent,
            String remark,
            String sourceCustomerTypeText
    ) {

        static TargetLead from(SourceLead sourceLead, Contact contact, AddressParts addressParts) {
            String company = normalizeText(sourceLead.company());
            String customerTypeText = normalizeText(sourceLead.customerTypeText());
            return new TargetLead(
                    company,
                    normalizeText(sourceLead.developer()),
                    company,
                    CustomerClassifier.extractCustomerCategory(customerTypeText),
                    FIXED_REGION,
                    CustomerClassifier.extractBusinessCategory(customerTypeText),
                    CustomerClassifier.extractCustomerType(customerTypeText),
                    normalizeText(sourceLead.address()),
                    normalizeText(sourceLead.channel()),
                    company,
                    contact.name(),
                    contact.mobile(),
                    addressParts.province(),
                    addressParts.city(),
                    addressParts.area(),
                    normalizeText(sourceLead.customerStatus()),
                    normalizeText(sourceLead.inquiryContent()),
                    RemarkBuilder.build(sourceLead),
                    customerTypeText
            );
        }

        List<String> toRow() {
            return List.of(company, developer, keyword, customerCategory, region, businessCategory, customerType,
                    address, channel, brand, contactName, mobile, province, city, area, customerStatus, inquiryContent,
                    remark);
        }
    }

    private static final class RemarkBuilder {

        private RemarkBuilder() {
        }

        static String build(SourceLead sourceLead) {
            List<String> lines = new ArrayList<>();
            appendLine(lines, "客户状态", sourceLead.customerStatus());
            appendLine(lines, "跟进反馈", sourceLead.followUpFeedback());
            appendLine(lines, "询盘内容", sourceLead.inquiryContent());
            appendLine(lines, "渠道", sourceLead.channel());
            appendLine(lines, "客户类型", sourceLead.customerTypeText());
            appendLine(lines, "咨询系列", sourceLead.consultingSeries());
            appendLine(lines, "咨询产品色号", sourceLead.productColorCode());
            return String.join("\n", lines);
        }

        private static void appendLine(List<String> lines, String label, String value) {
            String normalizedValue = normalizeText(value);
            if (!normalizedValue.isBlank()) {
                lines.add(label + "：" + normalizedValue);
            }
        }
    }

    private static final class EnumAuditAccumulator {

        private final String sourceValue;
        private int count;
        private String customerCategory = "";
        private String businessCategory = "";
        private String customerType = "";

        private EnumAuditAccumulator(String sourceValue) {
            this.sourceValue = sourceValue;
        }

        void add(TargetLead lead) {
            count++;
            customerCategory = mergeHit(customerCategory, lead.customerCategory());
            businessCategory = mergeHit(businessCategory, lead.businessCategory());
            customerType = mergeHit(customerType, lead.customerType());
        }

        EnumAuditRow toRow() {
            return new EnumAuditRow(sourceValue, count, customerCategory, businessCategory, customerType,
                    pendingFields());
        }

        private String pendingFields() {
            if (!customerCategory.isBlank() || !businessCategory.isBlank() || !customerType.isBlank()) {
                return "";
            }
            return "客户类别；经营大类；客户类型";
        }

        private String mergeHit(String existingValue, String newValue) {
            if (newValue == null || newValue.isBlank()) {
                return existingValue;
            }
            if (existingValue.isBlank()) {
                return newValue;
            }

            List<String> values = new ArrayList<>(List.of(existingValue.split("；")));
            for (String item : newValue.split("；")) {
                if (!values.contains(item)) {
                    values.add(item);
                }
            }
            return String.join("；", values);
        }
    }

    private record EnumAuditRow(
            String sourceValue,
            int count,
            String customerCategory,
            String businessCategory,
            String customerType,
            String pendingFields
    ) {
    }

    private static final class LlmPhoneCorrector {

        private static final String DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
        private static final URI DEFAULT_OPENAI_ENDPOINT = URI.create("https://api.openai.com/v1/chat/completions");

        private final Optional<OpenAiPhoneExtractionClient> extractionClient;
        private final Map<String, String> cache = new HashMap<>();

        private LlmPhoneCorrector(Optional<OpenAiPhoneExtractionClient> extractionClient) {
            this.extractionClient = extractionClient;
        }

        static LlmPhoneCorrector fromEnvironment() {
            String apiKey = System.getenv("OPENAI_API_KEY");
            if (apiKey == null || apiKey.isBlank()) {
                return new LlmPhoneCorrector(Optional.empty());
            }

            String model = Optional.ofNullable(System.getenv("OPENAI_MODEL"))
                    .filter(value -> !value.isBlank())
                    .orElse(DEFAULT_OPENAI_MODEL);
            URI endpoint = Optional.ofNullable(System.getenv("OPENAI_CHAT_COMPLETIONS_URL"))
                    .filter(value -> !value.isBlank())
                    .map(URI::create)
                    .orElse(DEFAULT_OPENAI_ENDPOINT);
            return new LlmPhoneCorrector(Optional.of(new OpenAiPhoneExtractionClient(apiKey, model, endpoint)));
        }

        Contact correct(String rawContactText, Contact contact) {
            if (!contact.mobile().isBlank() || extractionClient.isEmpty()) {
                return contact;
            }

            String correctedPhone = cache.computeIfAbsent(normalizeText(rawContactText), this::extractPhone);
            if (correctedPhone.isBlank()) {
                return contact;
            }
            return contact.withMobile(correctedPhone);
        }

        private String extractPhone(String rawContactText) {
            if (rawContactText.isBlank()) {
                return "";
            }

            String phone = extractionClient.map(client -> client.extractPhone(rawContactText)).orElse("");
            return normalizeLlmPhone(rawContactText, phone);
        }

        private String normalizeLlmPhone(String rawContactText, String rawPhone) {
            String phone = Contact.normalizePhone(rawPhone);
            if (!isPlausiblePhone(phone) || !isSupportedBySource(rawContactText, phone)) {
                return "";
            }
            return phone;
        }

        private boolean isPlausiblePhone(String phone) {
            String digits = phone.replaceAll("[^0-9]", "");
            return digits.length() >= 7 && digits.length() <= 15;
        }

        private boolean isSupportedBySource(String rawContactText, String phone) {
            String sourceDigits = normalizeText(rawContactText).replaceAll("[^0-9]", "");
            String phoneDigits = phone.replaceAll("[^0-9]", "");
            return !sourceDigits.isBlank() && sourceDigits.contains(phoneDigits);
        }
    }

    private static final class OpenAiPhoneExtractionClient {

        private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);

        private final String apiKey;
        private final String model;
        private final URI endpoint;
        private final HttpClient httpClient;

        private OpenAiPhoneExtractionClient(String apiKey, String model, URI endpoint) {
            this.apiKey = apiKey;
            this.model = model;
            this.endpoint = endpoint;
            this.httpClient = HttpClient.newBuilder()
                    .connectTimeout(REQUEST_TIMEOUT)
                    .build();
        }

        String extractPhone(String rawContactText) {
            try {
                JsonNode response = postExtractionRequest(rawContactText);
                String content = response.path("choices").path(0).path("message").path("content").asText("");
                if (content.isBlank()) {
                    return "";
                }

                JsonNode decision = JSON_MAPPER.readTree(content);
                return decision.path("phone").asText("");
            } catch (IOException | InterruptedException ex) {
                if (ex instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                System.err.println("LLM联系方式号码抽取失败，已保留正则结果: " + ex.getMessage());
                return "";
            }
        }

        private JsonNode postExtractionRequest(String rawContactText) throws IOException, InterruptedException {
            String requestBody = JSON_MAPPER.writeValueAsString(Map.of(
                    "model", model,
                    "temperature", 0,
                    "messages", List.of(
                            Map.of(
                                    "role", "system",
                                    "content", "你只从原始联系方式文本中抽取真实电话号码或手机号。"
                                            + "只能输出文本中已经出现的号码，不要猜测、不要补全不存在的区号。"
                                            + "不要把姓名、公司名、微信号、备注当成电话。"
                                            + "号码可保留开头+国家或地区码；没有明确电话号码时输出空字符串。"
                            ),
                            Map.of("role", "user", "content", rawContactText)
                    ),
                    "response_format", Map.of(
                            "type", "json_schema",
                            "json_schema", Map.of(
                                    "name", "lead_phone_extraction",
                                    "strict", true,
                                    "schema", Map.of(
                                            "type", "object",
                                            "additionalProperties", false,
                                            "properties", Map.of(
                                                    "phone", Map.of("type", "string")
                                            ),
                                            "required", List.of("phone")
                                    )
                            )
                    )
            ));

            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(REQUEST_TIMEOUT)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IOException("OpenAI API 返回 HTTP " + response.statusCode());
            }
            return JSON_MAPPER.readTree(response.body());
        }
    }

    private static final class LlmRejectionFilter {

        private static final String CONSULTING_STATUS = "咨询";
        private static final String DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
        private static final URI DEFAULT_OPENAI_ENDPOINT = URI.create("https://api.openai.com/v1/chat/completions");
        private static final List<String> DETERMINISTIC_REJECTION_KEYWORDS = List.of(
                "不要了", "不需要", "暂时不需要", "不用了", "没需求", "无需求", "不考虑",
                "拒绝", "拉黑", "勿扰", "不做", "不找", "不采购", "不买", "不合作",
                "已解决", "已经买了", "找到了", "价格太高", "太贵", "没兴趣"
        );

        private final Optional<OpenAiDecisionClient> decisionClient;
        private final Map<String, Boolean> cache = new HashMap<>();

        private LlmRejectionFilter(Optional<OpenAiDecisionClient> decisionClient) {
            this.decisionClient = decisionClient;
        }

        static LlmRejectionFilter fromEnvironment() {
            String apiKey = System.getenv("OPENAI_API_KEY");
            if (apiKey == null || apiKey.isBlank()) {
                return new LlmRejectionFilter(Optional.empty());
            }

            String model = Optional.ofNullable(System.getenv("OPENAI_MODEL"))
                    .filter(value -> !value.isBlank())
                    .orElse(DEFAULT_OPENAI_MODEL);
            URI endpoint = Optional.ofNullable(System.getenv("OPENAI_CHAT_COMPLETIONS_URL"))
                    .filter(value -> !value.isBlank())
                    .map(URI::create)
                    .orElse(DEFAULT_OPENAI_ENDPOINT);
            return new LlmRejectionFilter(Optional.of(new OpenAiDecisionClient(apiKey, model, endpoint)));
        }

        boolean isRejected(TargetLead lead) {
            if (!CONSULTING_STATUS.equals(normalizeText(lead.customerStatus()))) {
                return false;
            }

            String inquiryContent = normalizeText(lead.inquiryContent());
            if (inquiryContent.isBlank()) {
                return false;
            }
            Boolean deterministicDecision = deterministicDecision(inquiryContent);
            if (deterministicDecision != null) {
                return deterministicDecision;
            }
            return cache.computeIfAbsent(inquiryContent, this::queryLlm);
        }

        private Boolean deterministicDecision(String inquiryContent) {
            for (String keyword : DETERMINISTIC_REJECTION_KEYWORDS) {
                if (inquiryContent.contains(keyword)) {
                    return true;
                }
            }
            return null;
        }

        private boolean queryLlm(String inquiryContent) {
            return decisionClient.map(client -> client.isExplicitlyRejected(inquiryContent)).orElse(false);
        }
    }

    private static final class OpenAiDecisionClient {

        private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);
        private final String apiKey;
        private final String model;
        private final URI endpoint;
        private final HttpClient httpClient;

        private OpenAiDecisionClient(String apiKey, String model, URI endpoint) {
            this.apiKey = apiKey;
            this.model = model;
            this.endpoint = endpoint;
            this.httpClient = HttpClient.newBuilder()
                    .connectTimeout(REQUEST_TIMEOUT)
                    .build();
        }

        boolean isExplicitlyRejected(String inquiryContent) {
            try {
                JsonNode response = postDecisionRequest(inquiryContent);
                String content = response.path("choices").path(0).path("message").path("content").asText("");
                if (content.isBlank()) {
                    return false;
                }

                JsonNode decision = JSON_MAPPER.readTree(content);
                return "REJECT".equals(decision.path("decision").asText(""));
            } catch (IOException | InterruptedException ex) {
                if (ex instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                System.err.println("LLM拒绝意图判断失败，已默认保留该行: " + ex.getMessage());
                return false;
            }
        }

        private JsonNode postDecisionRequest(String inquiryContent) throws IOException, InterruptedException {
            String requestBody = JSON_MAPPER.writeValueAsString(Map.of(
                    "model", model,
                    "temperature", 0,
                    "messages", List.of(
                            Map.of(
                                    "role", "system",
                                    "content", "你只判断客户询盘内容是否明确拒绝继续沟通或采购。"
                                            + "只有出现明确拒绝、明确不要、明确不需要、明确不合作时输出 REJECT；"
                                            + "信息不足、只是询价、暂未判断、普通咨询都输出 KEEP。"
                            ),
                            Map.of("role", "user", "content", inquiryContent)
                    ),
                    "response_format", Map.of(
                            "type", "json_schema",
                            "json_schema", Map.of(
                                    "name", "lead_rejection_decision",
                                    "strict", true,
                                    "schema", Map.of(
                                            "type", "object",
                                            "additionalProperties", false,
                                            "properties", Map.of(
                                                    "decision", Map.of(
                                                            "type", "string",
                                                            "enum", List.of("KEEP", "REJECT")
                                                    )
                                            ),
                                            "required", List.of("decision")
                                    )
                            )
                    )
            ));

            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(REQUEST_TIMEOUT)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IOException("OpenAI API 返回 HTTP " + response.statusCode());
            }
            return JSON_MAPPER.readTree(response.body());
        }
    }

    private record Contact(String name, String mobile) {

        static Contact parse(String rawText) {
            String text = normalizeText(rawText);
            if (text.isBlank()) {
                return new Contact("", "");
            }

            Matcher matcher = PHONE_PATTERN.matcher(text);
            String mobile = "";
            if (matcher.find()) {
                mobile = normalizePhone(matcher.group());
            }

            String name = matcher.replaceAll(" ");
            name = name.replaceAll("(?i)(tel|phone|mobile|wechat|wx|微信|电话|手机|联系人|姓名|客户名称|客户)[:：]?", " ");
            name = name.replaceAll("[,，;；/|、]+", " ");
            name = normalizeText(name);
            return new Contact(name, mobile);
        }

        Contact withMobile(String mobile) {
            return new Contact(name, mobile);
        }

        static String normalizePhone(String rawPhone) {
            String phone = rawPhone.replaceAll("[\\s\\-()（）]", "");
            if (phone.startsWith("+")) {
                return "+" + phone.substring(1).replaceAll("[^0-9]", "");
            }
            return phone.replaceAll("[^0-9]", "");
        }
    }

    private static final class CustomerClassifier {

        private static final LinkedHashMap<String, List<String>> CUSTOMER_CATEGORY_RULES = new LinkedHashMap<>();
        private static final LinkedHashMap<String, List<String>> BUSINESS_CATEGORY_RULES = new LinkedHashMap<>();
        private static final LinkedHashMap<String, List<String>> CUSTOMER_TYPE_RULES = new LinkedHashMap<>();

        static {
            CUSTOMER_CATEGORY_RULES.put("男装", List.of("男装", "男士", "男款"));
            CUSTOMER_CATEGORY_RULES.put("女装", List.of("女装", "女士", "女款"));
            CUSTOMER_CATEGORY_RULES.put("童装", List.of("童装", "儿童", "童款"));
            CUSTOMER_CATEGORY_RULES.put("内衣、家具", List.of("内衣", "文胸", "家居服", "家具", "家纺", "家居"));
            CUSTOMER_CATEGORY_RULES.put("鞋帽、饰品、宠物", List.of("鞋帽", "鞋", "帽", "饰品", "配饰", "首饰", "宠物", "猫", "狗"));

            BUSINESS_CATEGORY_RULES.put("服装", List.of("服装", "男装", "女装", "童装", "内衣", "鞋帽", "饰品"));
            BUSINESS_CATEGORY_RULES.put("二批", List.of("二批", "批发", "贸易商"));

            CUSTOMER_TYPE_RULES.put("市场", List.of("市场", "档口", "摊位"));
            CUSTOMER_TYPE_RULES.put("品牌", List.of("品牌"));
            CUSTOMER_TYPE_RULES.put("电商", List.of("电商", "淘宝", "天猫", "抖音", "快手", "小红书", "直播"));
            CUSTOMER_TYPE_RULES.put("供应链/工厂", List.of("供应链", "工厂", "加工厂", "生产"));
            CUSTOMER_TYPE_RULES.put("贸易商/二批", List.of("贸易商", "二批", "批发"));
            CUSTOMER_TYPE_RULES.put("外贸", List.of("外贸", "出口", "跨境"));
        }

        private CustomerClassifier() {
        }

        static String extractCustomerCategory(String customerTypeText) {
            return String.join("；", extractByRules(customerTypeText, CUSTOMER_CATEGORY_RULES));
        }

        static String extractBusinessCategory(String customerTypeText) {
            return String.join("；", extractByRules(customerTypeText, BUSINESS_CATEGORY_RULES));
        }

        static String extractCustomerType(String customerTypeText) {
            return String.join("；", extractByRules(customerTypeText, CUSTOMER_TYPE_RULES));
        }
    }

    private record AddressParts(String province, String city, String area) {

        static AddressParts empty() {
            return new AddressParts("", "", "");
        }
    }

    private record AreaNode(String province, String city, String area) {

        AddressParts toAddressParts() {
            return new AddressParts(province, city, area);
        }
    }

    private static final class AddressResolver {

        private static final List<String> MUNICIPALITIES = List.of("北京市", "天津市", "上海市", "重庆市");
        private final List<AreaNode> areaNodes;

        private AddressResolver(List<AreaNode> areaNodes) {
            this.areaNodes = areaNodes;
        }

        static AddressResolver load(Path addressPath) throws IOException {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(addressPath.toFile());
            if (!root.isArray()) {
                throw new IllegalArgumentException("地址库根节点必须是数组: " + addressPath);
            }

            List<AreaNode> nodes = new ArrayList<>();
            for (JsonNode provinceNode : root) {
                String province = provinceNode.path("name").asText("");
                for (JsonNode cityNode : provinceNode.path("children")) {
                    String city = normalizeCityName(province, cityNode.path("name").asText(""));
                    JsonNode children = cityNode.path("children");
                    if (!children.isArray() || children.isEmpty()) {
                        nodes.add(new AreaNode(province, city, ""));
                        continue;
                    }
                    for (JsonNode areaNode : children) {
                        nodes.add(new AreaNode(province, city, areaNode.path("name").asText("")));
                    }
                }
            }
            nodes.sort(Comparator.comparingInt((AreaNode node) -> node.area().length()).reversed());
            return new AddressResolver(nodes);
        }

        Optional<AddressParts> resolve(String rawAddress) {
            String address = normalizeText(rawAddress);
            if (address.isBlank()) {
                return Optional.empty();
            }

            Match best = null;
            for (AreaNode node : areaNodes) {
                Match match = score(address, node);
                if (match.score() <= 0) {
                    continue;
                }
                if (best == null || match.score() > best.score()) {
                    best = match;
                }
            }
            return Optional.ofNullable(best).map(Match::toAddressParts);
        }

        private Match score(String address, AreaNode node) {
            int score = 0;
            boolean provinceMatched = containsArea(address, node.province());
            boolean cityMatched = containsArea(address, node.city());
            boolean areaMatched = !node.area().isBlank() && containsArea(address, node.area());
            if (provinceMatched) {
                score += 30;
            }
            if (cityMatched) {
                score += 60;
            }
            if (areaMatched) {
                score += 120 + node.area().length();
            }
            return new Match(node, score, provinceMatched, cityMatched, areaMatched);
        }

        private boolean containsArea(String address, String areaName) {
            if (areaName == null || areaName.isBlank() || "市辖区".equals(areaName)) {
                return false;
            }
            String shortName = normalizeAreaName(areaName);
            return address.contains(areaName) || (!shortName.isBlank() && address.contains(shortName));
        }

        private static String normalizeCityName(String province, String city) {
            if ("市辖区".equals(city) && MUNICIPALITIES.contains(province)) {
                return province;
            }
            return city;
        }

        private record Match(
                AreaNode node,
                int score,
                boolean provinceMatched,
                boolean cityMatched,
                boolean areaMatched
        ) {

            AddressParts toAddressParts() {
                String province = node.province();
                String city = cityMatched || areaMatched ? node.city() : "";
                String area = areaMatched ? node.area() : "";
                if (!provinceMatched && !cityMatched && !areaMatched) {
                    province = "";
                }
                return new AddressParts(province, city, area);
            }
        }
    }

    private static final class StreamText {

        private StreamText() {
        }

        static boolean allBlank(String... values) {
            for (String value : values) {
                if (!Objects.toString(value, "").isBlank()) {
                    return false;
                }
            }
            return true;
        }
    }
}
