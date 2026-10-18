package com.exceptioncoder.toolbox.ops.resources.application;

import com.exceptioncoder.toolbox.common.resource.*;
import org.springframework.stereotype.Service;
import java.net.URI;
import java.nio.file.Path;
import java.util.List;

/** 网页账号授权仍由原系统绑定和流程快照决定，密码只交给浏览器端口。 */
@Service
public class ConsultWebResourceService implements WebResourceGateway {
    private final SystemResourceService resources;
    private final List<ProjectSystemDirectory> directories;
    private final List<BrowserLoginResources> accounts;
    private final WebPageReader browser;

    public ConsultWebResourceService(SystemResourceService resources, List<ProjectSystemDirectory> directories,
                                     List<BrowserLoginResources> accounts, WebPageReader browser) {
        this.resources = resources; this.directories = directories; this.accounts = accounts; this.browser = browser;
    }

    @Override
    public List<ReadonlyResourceGateway.Entry> catalog() {
        var browserTargets = accounts.stream().flatMap(provider -> provider.targets().stream()).toList();
        var browserAccounts = browserTargets.stream().map(BrowserLoginTarget::id).collect(java.util.stream.Collectors.toSet());
        return directories.stream().flatMap(directory -> directory.systems().stream()).flatMap(system ->
                resources.discover(system.id()).stream().filter(item -> "application".equals(item.binding().providerId()))
                .map(item -> new ReadonlyResourceGateway.Entry(item.binding().id(), system.id(), system.name(),
                        item.resource() == null ? item.binding().resourceId() : item.resource().name() + " · " + item.resource().account(),
                        item.resource() == null ? "UNKNOWN" : item.resource().environment(), item.binding().purpose(),
                        webState(item, browserAccounts), item.resource() == null ? "/tools/reqpool/resources?view=accounts" : item.resource().configurationUrl(),
                        item.resource() == null ? null : safeEndpoint(browserTargets.stream().filter(target -> target.id().equals(item.binding().resourceId()))
                                .map(BrowserLoginTarget::baseUrl).findFirst().orElse(item.resource().endpoint())), "APP"))).toList();
    }

    @Override
    public List<ReadonlyResourceGateway.Entry> discover(String sourcePath, List<String> bindingIds) {
        if (sourcePath == null || sourcePath.isBlank()) { throw new IllegalArgumentException("咨询缺少源码目录"); }
        var systems = directories.stream().flatMap(directory -> directory.systems().stream())
                .filter(system -> system.sourcePath() != null && !system.sourcePath().isBlank()
                        && Path.of(system.sourcePath()).toAbsolutePath().normalize().equals(Path.of(sourcePath).toAbsolutePath().normalize())).toList();
        if (systems.size() != 1) { throw new IllegalArgumentException("咨询目录未唯一关联项目库系统"); }
        return catalog().stream().filter(entry -> entry.systemId().equals(systems.getFirst().id())
                && bindingIds.contains(entry.bindingId())).toList();
    }

    @Override
    public Object read(String runtimeId, String sourcePath, List<String> bindingIds, Request request) {
        var available = discover(sourcePath, bindingIds);
        var entry = available.stream().filter(item -> item.bindingId().equals(request.bindingId())).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Web账号未被本咨询选择或不属于当前系统"));
        if (!"AVAILABLE".equals(entry.state())) { throw new IllegalArgumentException("Web账号不可用：" + entry.state()); }
        var bound = resources.discover(entry.systemId()).stream()
                .filter(item -> item.binding().id().equals(entry.bindingId())).findFirst().orElseThrow();
        if (!bound.binding().enabled() || bound.resource() == null || !ResourceEnvironmentPolicy.allowed(bound.resource().environment())) { throw new IllegalArgumentException("Web绑定已停用或环境受限"); }
        var provider = accounts.stream().filter(item -> item.targets().stream()
                .anyMatch(account -> account.id().equals(bound.binding().resourceId()))).toList();
        if (provider.size() != 1) { throw new IllegalArgumentException("网页登录账号不可用或存在歧义"); }
        var account = provider.getFirst().require(bound.binding().resourceId());
        if (!account.environment().equalsIgnoreCase(entry.environment())) {
            throw new IllegalArgumentException("账号环境在读取期间已更新，请重新发现资源后再登录");
        }
        String path = targetPath(account.baseUrl(), request.url());
        validateEnvironment(available, entry, request);
        String login = request.loginPage() == null || request.loginPage().isBlank()
                ? URI.create(account.baseUrl()).getRawPath() : request.loginPage();
        login = login == null || login.isBlank() ? "/" : login;
        login = targetPath(account.baseUrl(), login);
        var page = browser.read(runtimeId + ":" + entry.bindingId(), account, path, login);
        return new Evidence(entry, account.username(), page);
    }

    private void validateEnvironment(List<ReadonlyResourceGateway.Entry> entries, ReadonlyResourceGateway.Entry entry, Request request) {
        if (request.environment() != null && !request.environment().isBlank()) {
            if (!entry.environment().equalsIgnoreCase(request.environment().trim())) {
                throw new IllegalArgumentException("所选账号与明确环境不一致，未尝试登录");
            }
            return;
        }
        boolean absolute = request.url() != null && URI.create(request.url()).isAbsolute();
        if (!absolute && entries.stream().filter(item -> "AVAILABLE".equals(item.state()))
                .map(ReadonlyResourceGateway.Entry::environment).distinct().count() > 1) {
            throw new IllegalArgumentException("存在多个环境，请根据用户URL或明确环境选择；无法确认时询问地址，不能盲试");
        }
        if (absolute && entries.stream().filter(item -> "AVAILABLE".equals(item.state()) && item.endpoint() != null
                && matchesTarget(item.endpoint(), request.url())).map(ReadonlyResourceGateway.Entry::environment).distinct().count() > 1) {
            throw new IllegalArgumentException("此地址对应多个环境，请明确环境后再登录");
        }
    }

    static String targetPath(String baseUrl, String value) {
        URI base = URI.create(baseUrl);
        if (base.getHost() == null || base.getRawUserInfo() != null || base.getRawQuery() != null || base.getRawFragment() != null
                || !("http".equalsIgnoreCase(base.getScheme()) || "https".equalsIgnoreCase(base.getScheme()))) {
            throw new IllegalArgumentException("应用地址必须是不含凭据、查询或片段的HTTP(S)地址");
        }
        String raw = value == null || value.isBlank() ? (base.getRawPath().isBlank() ? "/" : base.getRawPath()) : value;
        URI target = URI.create(raw);
        if (raw.contains("\\") || raw.startsWith("//") || raw.matches("(?i).*[?&](token|password|access_token)=.*")
                || target.getRawUserInfo() != null || target.getRawFragment() != null) {
            throw new IllegalArgumentException("页面路径不能携带凭据或指向其他站点");
        }
        if (target.isAbsolute()) {
            if (!sameOrigin(baseUrl, raw)) { throw new IllegalArgumentException("页面地址与所选账号不同源，未尝试登录"); }
            raw = target.getRawPath() + (target.getRawQuery() == null ? "" : "?" + target.getRawQuery());
        }
        if (raw.isEmpty()) { raw = "/"; }
        if (!raw.startsWith("/")) { throw new IllegalArgumentException("请输入站内路径或完整URL"); }
        String prefix = base.normalize().getPath().replaceAll("/+$", "");
        String path = URI.create(raw).getPath();
        String query = target.getRawQuery();
        if (path.contains("\\") || path.startsWith("//") || path.matches(".*(?:^|/)\\.\\.?(?:/|$).*")
                || (query != null && java.net.URLDecoder.decode(query, java.nio.charset.StandardCharsets.UTF_8)
                .matches("(?i).*(?:^|&)(token|password|access_token)=.*"))) {
            throw new IllegalArgumentException("页面地址包含不安全路径或凭据参数");
        }
        if (!prefix.isEmpty() && !path.equals(prefix) && !path.startsWith(prefix + "/")) {
            throw new IllegalArgumentException("页面超出此环境应用的配置路径");
        }
        return raw;
    }

    /** 未填写API登录路径不影响网页登录，是否支持由浏览器账号端口复核。 */
    private static String webState(SystemResourceService.BoundResource value, java.util.Set<String> browserAccounts) {
        if (!value.binding().enabled() || value.resource() == null || !ResourceEnvironmentPolicy.allowed(value.resource().environment())) {
            return value.state();
        }
        return browserAccounts.contains(value.binding().resourceId()) ? "AVAILABLE" : "REGISTRATION_ONLY";
    }

    private static String safeEndpoint(String value) {
        URI uri = URI.create(value);
        return uri.getScheme() + "://" + uri.getHost() + (uri.getPort() < 0 ? "" : ":" + uri.getPort()) + uri.getRawPath();
    }

    private static boolean matchesTarget(String base, String url) {
        try { targetPath(base, url); return true; }
        catch (IllegalArgumentException mismatch) { return false; }
    }

    private static boolean sameOrigin(String left, String right) {
        URI a = URI.create(left), b = URI.create(right);
        return a.getHost() != null && a.getScheme().equalsIgnoreCase(b.getScheme()) && a.getHost().equalsIgnoreCase(b.getHost())
                && port(a) == port(b);
    }
    private static int port(URI value) { return value.getPort() == -1 ? ("https".equalsIgnoreCase(value.getScheme()) ? 443 : 80) : value.getPort(); }
    /** 页面是外部证据，账号只返回标识，不含密码。 */
    public record Evidence(ReadonlyResourceGateway.Entry resource, String account, WebPageReader.Page page) { }
}
