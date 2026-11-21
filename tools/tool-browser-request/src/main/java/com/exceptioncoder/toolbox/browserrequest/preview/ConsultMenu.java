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
              const controls = document.querySelectorAll('summary,button[aria-controls],[role=button][aria-controls],[role=menuitem][aria-controls],[role=treeitem][aria-controls]');
              return Array.from(controls).filter(el => {
                if (!el.checkVisibility({visibilityProperty: true}) || el.closest('form,[href],[inert]') ||
                    el.matches(':disabled,[form],[aria-disabled=true]')) return false;
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
              const panel = details ? el.parentElement : document.getElementById(el.getAttribute('aria-controls'));
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

    static WebPageReader.Page read(Page page, String baseUrl, String name) {
        String initial = page.url();
        URI target = URI.create(initial);
        URI base = URI.create(baseUrl);
        String prefix = base.normalize().getPath().replaceAll("/+$", "");
        String path = target.normalize().getPath();
        String origin = base.getScheme() + "://" + base.getRawAuthority();
        if (!PlaywrightPreviewBrowser.sameOrigin(baseUrl, initial) || path == null || path.contains("\\") ||
                path.matches(".*(?:^|/)\\.\\.?(?:/|$).*") ||
                (!prefix.isEmpty() && !path.equals(prefix) && !path.startsWith(prefix + "/"))) {
            return unavailable(origin);
        }
        String safeUrl = origin + target.getRawPath();
        try {
            // 连同 GET（可能有副作用）、弹出页和延迟请求一起阻断。调用方随后销毁整个上下文。
            page.context().route("**/*", route -> route.abort());
            page.context().setOffline(true);
            ElementHandle control = page.evaluateHandle(RESOLVE, name.strip()).asElement();
            if (control == null) {
                String names = (String) page.evaluate(NAMES);
                if (names.isEmpty()) { return unavailable(safeUrl); }
                return new WebPageReader.Page("MENU_UNAVAILABLE", safeUrl, "未唯一匹配菜单",
                        "请指定一个唯一的菜单名称。页面上可识别的导航控件有：" + names);
            }
            if (Boolean.FALSE.equals(control.evaluate(MENU_TEXT))) {
                control.click(new ElementHandle.ClickOptions().setTimeout(2500));
            }
            Object text = page.waitForFunction(MENU_TEXT, control, new Page.WaitForFunctionOptions().setTimeout(2500)).jsonValue();
            if (!initial.equals(page.url()) || !(text instanceof String contents)) { return unavailable(safeUrl); }
            return new WebPageReader.Page("READY", safeUrl, page.title(), contents);
        } catch (PlaywrightException unavailable) {
            return unavailable(safeUrl);
        }
    }

    private static WebPageReader.Page unavailable(String url) {
        return new WebPageReader.Page("MENU_UNAVAILABLE", url, "未取得菜单内容",
                "请核对页面上唯一的导航展开控件名称。没有可识别控件、需要联网加载或未显示菜单内容时，可核对已授权的只读菜单接口。");
    }
}
