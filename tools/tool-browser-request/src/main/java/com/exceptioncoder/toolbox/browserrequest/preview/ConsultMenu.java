package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.common.resource.WebPageReader;
import com.microsoft.playwright.ElementHandle;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.PlaywrightException;
import java.net.URI;

/** 在即将销毁的只读页面展开有明确菜单语义的控件，只返回关联面板中的可见内容。 */
final class ConsultMenu {
    private ConsultMenu() { }

    private static final String CONTROLS = """
            () => {
              const nav = 'nav,[role=navigation],[role=menubar],[role=menu],[role=tree]';
              const controls = document.querySelectorAll('summary,button[aria-controls],[role=button][aria-controls],[role=menuitem][aria-controls],[role=treeitem][aria-controls],li > a[href="#"]');
              return Array.from(controls).filter(el => {
                if (!el.checkVisibility({visibilityProperty: true}) || el.closest('form,[inert]') ||
                    el.matches(':disabled,[form],[aria-disabled=true]')) return false;
                if (el.matches('a')) {
                  const row = el.parentElement;
                  const target = el.getAttribute('target') || document.querySelector('base[target]')?.target || '_self';
                  return el.href === location.href.split('#')[0] + '#' && target.toLowerCase() === '_self' &&
                    !el.matches('[download],[ping]') && !row.closest('[href]') && row.parentElement?.matches('ul,ol') &&
                    el.nextElementSibling?.matches('ul,ol') && row.querySelectorAll(':scope > ul,:scope > ol').length === 1;
                }
                if (el.closest('[href]')) return false;
                if (el.matches('summary')) return el.parentElement?.matches('details') && el.closest(nav);
                const panel = document.getElementById(el.getAttribute('aria-controls'));
                return panel && (['true','menu'].includes(el.getAttribute('aria-haspopup')) ||
                    (el.closest(nav) && ['true','false'].includes(el.getAttribute('aria-expanded'))));
              }).map(el => [el, (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\\s+/g, ' ')]);
            }
            """;
    private static final String RESOLVE = "name => { const matches = (" + CONTROLS +
            ")().filter(([,label]) => label === name); return matches.length === 1 ? matches[0][0] : null; }";
    private static final String NAMES = "() => (" + CONTROLS +
            ")().map(([,label]) => label).filter(label => label && label.length <= 120).slice(0, 30).join('、')";

    private static final String MENU_TEXT = """
            el => {
              if (!el.isConnected) return false;
              const details = el.matches('summary');
              const panel = details ? el.parentElement : el.matches('a') ? el.nextElementSibling :
                document.getElementById(el.getAttribute('aria-controls'));
              if (!panel || !panel.checkVisibility({visibilityProperty: true}) ||
                  (details ? !panel.open : el.getAttribute('aria-expanded') === 'false')) return false;
              const entries = panel.querySelectorAll('a[href],li,button,[role=menuitem],[role=treeitem],[role=link]');
              if (panel.getAttribute('aria-busy') === 'true' ||
                  !Array.from(entries).some(item => item.checkVisibility({visibilityProperty: true}) && item.innerText?.trim())) return false;
              const text = details ? Array.from(panel.children).filter(child => child !== el && child.checkVisibility({visibilityProperty: true}))
                  .map(child => child.innerText).filter(Boolean).join('\\n') : panel.innerText;
              return text?.trim().slice(0, 12000) || false;
            }
            """;

    static boolean isWithinApplication(String baseUrl, String actualUrl) {
        URI base = URI.create(baseUrl);
        String origin = base.getScheme() + "://" + base.getRawAuthority();
        if (!PlaywrightPreviewBrowser.sameOrigin(origin, actualUrl)) { return false; }
        URI target = URI.create(actualUrl);
        String prefix = base.normalize().getPath().replaceAll("/+$", "");
        String path = target.getPath();
        return target.getRawUserInfo() == null && path != null && !path.contains("\\") && !path.startsWith("//")
                && !path.matches(".*(?:^|/)\\.\\.?(?:/|$).*")
                && (prefix.isEmpty() || path.equals(prefix) || path.startsWith(prefix + "/"));
    }

    static WebPageReader.Page read(Page page, String baseUrl, String name) {
        String initial = page.url();
        URI base = URI.create(baseUrl);
        String origin = base.getScheme() + "://" + base.getRawAuthority();
        if (!isWithinApplication(baseUrl, initial)) {
            return unavailable(origin, "菜单页超出已授权的站点或应用路径，未点击。");
        }
        String safeUrl = origin + URI.create(initial).getRawPath();
        String failure = "无法将本次菜单操作置于离线状态，未点击。";
        try {
            // 连同 GET（可能有副作用）、弹出页和延迟请求一起阻断。调用方随后销毁整个上下文。
            page.context().route("**/*", route -> route.abort());
            page.context().setOffline(true);
            failure = "浏览器无法读取当前页面的导航控件，未点击。";
            ElementHandle control = page.evaluateHandle(RESOLVE, name.strip()).asElement();
            if (control == null) {
                String names = (String) page.evaluate(NAMES);
                if (names.isEmpty()) {
                    boolean labelPresent = page.locator("body").innerText().lines()
                            .anyMatch(line -> line.replace('\u00a0', ' ').strip().equals(name.strip()));
                    return unavailable(safeUrl, labelPresent
                            ? "页面正文显示了该名称，但没有识别到可安全展开的导航控件，未点击。"
                            : "当前页面正文未显示该菜单名称，也没有可识别的导航控件，未点击；请先核对登录状态与菜单页。");
                }
                return new WebPageReader.Page("MENU_UNAVAILABLE", safeUrl, "未唯一匹配菜单",
                        "请指定一个唯一的菜单名称。页面上可识别的导航控件有：" + names);
            }
            boolean emptyFragmentLink = Boolean.TRUE.equals(control.evaluate("el => el.matches('a[href=\"#\"]')"));
            int pagesBefore = page.context().pages().size();
            boolean collapsed = Boolean.FALSE.equals(control.evaluate(MENU_TEXT));
            if (collapsed) {
                failure = "已定位菜单，但浏览器未能完成对该控件的点击。";
                control.click(new ElementHandle.ClickOptions().setTimeout(2500));
            }
            failure = collapsed ? "已点击菜单，点击后未能确认可见子项。需要联网加载的菜单无法在离线页面核验。"
                    : "菜单原已展开，但未能确认仍然可见的子项。";
            Object text = page.waitForFunction(MENU_TEXT, control, new Page.WaitForFunctionOptions().setTimeout(2500)).jsonValue();
            String current = page.url();
            boolean sameDocument = initial.equals(current) || (emptyFragmentLink && current.equals(initial.split("#", 2)[0] + "#"));
            if (!sameDocument || page.context().pages().size() != pagesBefore || !(text instanceof String contents)) {
                return unavailable(safeUrl, "菜单操作后页面地址或窗口发生变化，未取得原页面的子项。");
            }
            return new WebPageReader.Page("READY", safeUrl, page.title(), contents,
                    collapsed ? WebPageReader.MenuAction.EXPANDED : WebPageReader.MenuAction.ALREADY_VISIBLE);
        } catch (PlaywrightException unavailable) {
            return unavailable(safeUrl, failure);
        }
    }

    private static WebPageReader.Page unavailable(String url, String reason) {
        return new WebPageReader.Page("MENU_UNAVAILABLE", url, "未取得菜单内容", reason);
    }
}
