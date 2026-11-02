const fs = require("node:fs"), path = require("node:path");
const esbuild = require("../../frontend/node_modules/esbuild");
const { chromium } = require("../../node-services/undetected-browser/node_modules/patchright-core");
const root = path.resolve(__dirname, "../.."), source = __dirname, fixture = path.join(root, ".run/readme-showcase");
const out = path.join(root, "docs/screenshots");
const names = { codex: "Codex", claude: "Claude Code", antigravity: "Antigravity", opencode: "OpenCode", qwen: "Qwen Code", pi: "Pi", copilot: "GitHub Copilot" };
const time = 17936568e5;
const sessions = [["showcase-orders", "手机端订单筛选", "codex", "演示商城", "RUNNING"], ["showcase-docs", "整理接口接入说明", "claude", "演示服务", "IDLE"], ["showcase-review", "复核订单列表交互", "opencode", "演示商城", "IDLE"]].map(([id, title, engine, systemGroup, status], i) => ({ id, title, engine, systemGroup, requirementGroup: "移动体验", cwd: "/workspace/demo/" + (i === 1 ? "demo-service" : "demo-shop"), sdkSessionId: "demo-" + id, providerKind: "official", status, startedAt: time - i * 9e5, lastSeenAt: time - i * 3e5, live: status === "RUNNING", favorite: false }));
const engines = Object.entries(names).map(([id, displayName]) => ({ id, displayName, selectable: true, availability: "stable", probe: { status: "ready" }, capabilities: ["resume", "interrupt", "modelCatalog"] }));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(fixture, { recursive: true });
  await esbuild.build({ entryPoints: [path.join(source, "fixture.tsx")], outfile: path.join(fixture, "fixture.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", alias: { "@": path.join(root, "frontend/src"), "react": path.join(root, "frontend/node_modules/react"), "react-dom": path.join(root, "frontend/node_modules/react-dom") }, nodePaths: [path.join(root, "frontend/node_modules")], define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" }, loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" }, minify: true, plugins: [{ name: "offline-runtime", setup(build) {
    build.onResolve({ filter: /ChatRuntimeContext$/ }, () => ({ path: path.join(source, "runtime.tsx") }));
    build.onLoad({ filter: /lib[\\/]mock[\\/]loader\.ts$/ }, () => ({ contents: "export const featuresWithMock = new Set(); export async function loadFeatureMocks(){}", loader: "ts" }));
  } }] });
  const cssDir = path.resolve(root, process.env.FORGE_SHOWCASE_STYLE_DIR || "frontend/dist/assets");
  const css = fs.readdirSync(cssDir).filter((f) => /^(index-|ChatControlWorkspace-|MessageList-|SessionPlanLockNotice-|markdown-|ReviewPage-).*\.css$/.test(f)).map((f) => fs.readFileSync(path.join(cssDir, f), "utf8")).join("\n");
  fs.writeFileSync(path.join(fixture, "fixture.css"), css);
  const html = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forge 公开演示</title><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0"><div id="root"></div><script src="/fixture.js"><\/script></body></html>';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const requests = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url()), p = url.pathname;
    if (url.hostname !== "forge-showcase.test") return route.abort();
    if (p === "/fixture.js") return route.fulfill({ body: 'document.body.dataset.started="yes";try{' + fs.readFileSync(path.join(fixture, "fixture.js"), "utf8") + "}catch(e){document.body.dataset.error=e.stack}", contentType: "application/javascript" });
    if (p === "/fixture.css") return route.fulfill({ body: css, contentType: "text/css" });
    if (!p.startsWith("/api/")) return route.fulfill({ body: html, contentType: "text/html" });
    requests.push(p);
    let data = [];
    if (p === "/api/claude-chat/sessions") data = sessions;
    else if (p.endsWith("/engine-catalog")) data = { engines };
    else if (p.endsWith("/workspaces")) data = { roots: [{ root: "/workspace/demo", projects: ["demo-shop", "demo-service"] }], scannedAt: "2026-11-03" };
    else if (p.endsWith("/provider-profiles")) data = [];
    else if (p.endsWith("/storage")) data = sessions.map((s) => ({ sessionId: s.id, status: "available", bytes: 28672, fileCount: 1, checkedAt: time, description: "演示会话", engines: [] }));
    else if (p.endsWith("/runtime-state")) data = { sessionId: "showcase-orders", effectiveStatus: "IDLE", consistency: "CONSISTENT", persistedStatus: "IDLE", backendStatus: "IDLE", browserConnected: true, javaSidecarConnected: true, sidecarSessionPresent: true, sidecarActive: false, pendingDecision: false, backgroundTaskCount: 0, activeTurnId: null, phase: null, agentState: "idle", lastHeartbeatAt: time, observedAt: time, stale: false, canSend: true, canQueue: true, canInterrupt: false, reason: "演示", recommendedAction: "" };
    else if (p.endsWith("/queue") || p.endsWith("/queued-messages")) {
      const id = p.split("/")[4];
      data = id === "showcase-orders" ? [{ id: "demo-queue-1", sessionId: id, text: "补充空结果提示，并附上复核步骤。", createdAt: time, attachments: [] }] : [];
    } else if (p.endsWith("/sites/configuration")) data = { quickSiteIds: [], customSites: [] };
    else if (p.endsWith("/review-relations")) data = null;
    else if (p.endsWith("/usage")) data = null;
    else if (p.endsWith("/markdown")) data = { path: "/workspace/demo/demo-shop/docs/复核说明.md", content: "# 手机端订单筛选\n\n> 公开演示文档 \xB7 场景示例\n\n## 目标\n让同事在手机上快速找到待处理订单，同时保留当前列表位置。\n\n## 验收步骤\n1. 打开筛选面板，选择待处理状态。\n2. 确认后检查列表与已选条件。\n3. 清除条件，确认恢复全部订单。\n4. 进入无结果条件，检查恢复入口。\n\n## 交接给同事\n将这份说明随评审入口发送，收集意见后回到原开发会话继续处理。\n\n## 验证状态\n此处为演示数据，未执行真实任务、测试或发布。", truncated: false, binary: false };
    else if (p.endsWith("/autopilot")) return route.fulfill({ status: 204 });
    else if (p.endsWith("/execution-control")) data = { enabled: true, verificationMode: "STANDARD", version: 1 };
    else if (p.endsWith("/batch")) data = null;
    else if (p.endsWith("/available") || p.endsWith("/dictation")) data = { available: true };
    else if (p.endsWith("/openspec/status")) data = { initialized: true, projectRoot: "/workspace/demo/demo-shop", missing: [] };
    return route.fulfill({ json: data });
  });
  await context.addInitScript(() => {
    window.__showcaseErrors = [];
    window.addEventListener("error", (e) => window.__showcaseErrors.push(e.message));
    window.addEventListener("unhandledrejection", (e) => window.__showcaseErrors.push(String(e.reason)));
    localStorage.setItem("toolbox.auth.token", "public-offline-demo");
    localStorage.setItem("toolbox.auth.user", JSON.stringify({ userId: 999, username: "演示用户", roles: ["ADMIN"] }));
    localStorage.setItem("toolbox.auth.superAdmin", "true");
    localStorage.setItem("toolbox.auth.expiresAt", String(Date.now() + 864e5));
    localStorage.setItem("kai-toolbox:claude-chat:drafts", JSON.stringify({ "showcase-orders": "请继续核对手机上的筛选交互，保留当前列表位置。" }));
    localStorage.setItem("forge.vibecoding.theme:999", "tokyo-night");
    localStorage.setItem("kai-toolbox:vibe-guide:v1:seen", "true");
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") browserErrors.push(msg.text().slice(0, 700));
  });
  await page.goto("https://forge-showcase.test/");
  try {
    async function ready() {
      await page.getByText("公开演示数据 \xB7 离线组件预览", { exact: true }).waitFor({ timeout: 15e3 });
      await page.waitForTimeout(800);
      const error = await page.locator("body").getAttribute("data-error");
      if (error) throw Error(error);
      if (await page.getByRole("button", { name: "跳过导览", exact: true }).count()) await page.getByRole("button", { name: "跳过导览", exact: true }).click();
    }
    async function shot(name) {
      if (browserErrors.length) throw Error(browserErrors.join("\n"));
      const text = await page.locator("body").innerText();
      if (/zhang|yoooni|D:\\Users|401|Exception|连接失败/.test(text)) throw Error("Unsafe or broken content: " + text.slice(0, 200));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) throw Error("Horizontal overflow " + name);
      await page.screenshot({ path: path.join(out, name + ".png") });
      console.log("CAPTURED", name);
    }
    await ready();
    await shot("mobile-conversation");
    await page.goto("https://forge-showcase.test/?view=board");
    await ready();
    await page.getByRole("heading", { name: "会话看板", exact: true }).waitFor();
    await shot("mobile-session-board");
    await page.goto("https://forge-showcase.test/?document=1");
    await ready();
    await page.getByRole("heading", { name: "复核说明.md", exact: true }).waitFor();
    await page.getByText("验收步骤", { exact: true }).waitFor();
    await shot("mobile-document-preview");
    await page.goto("https://forge-showcase.test/?planning=1");
    await ready();
    await page.getByRole("button", { name: "自动推进", exact: true }).click();
    await page.getByRole("radio", { name: "需求持续推进", exact: true }).check();
    await page.getByRole("textbox").fill("优化演示商城的手机筛选体验，保留列表位置与草稿；完成后提供改动说明和适用验证记录。");
    await shot("mobile-requirement-planning");
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("https://forge-showcase.test/");
    await ready();
    await shot("desktop-workspace");
    await page.getByRole("button", { name: "切换 agent（会话内切换，自动带上下文）", exact: true }).click();
    await page.getByRole("button", { name: "Claude", exact: true }).waitFor();
    await shot("desktop-engine-selection");
    await page.goto("https://forge-showcase.test/");
    await ready();
    await page.getByRole("button", { name: /^会话配置，当前/ }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "配置 Codex 模型、推理强度和速度", exact: true }).click();
    await page.waitForTimeout(200);
    await shot("desktop-model-configuration");
    console.log("OFFLINE_ENDPOINTS", [...new Set(requests)]);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
