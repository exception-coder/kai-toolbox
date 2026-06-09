// ============================================================================
//  Stealth init script —— 在每个文档执行前注入，覆盖 security-js 主流检测点
//  设计原则：
//    1. 只伪装真实浏览器本来就有的字段，绝不引入额外异常（如 Canvas 噪点）
//    2. 所有伪造值必须与 UA / Accept-Language / Timezone 一致（避免反向推断）
//    3. 用 Function.prototype.toString 守护被改写的方法，防止 .toString() 穿帮
// ============================================================================
(() => {
  // ----- 1. WebDriver / 自动化标识 ---------------------------------------
  // 关键：必须在 Navigator.prototype 上重定义（不是 instance）
  // 反爬常用 Reflect.getOwnPropertyDescriptor(Navigator.prototype,'webdriver') 探测
  try {
    const np = Object.getPrototypeOf(navigator);
    if (Object.getOwnPropertyDescriptor(np, 'webdriver')) {
      Object.defineProperty(np, 'webdriver', { get: () => false, configurable: true });
    }
  } catch (_) {}
  delete window.__webdriver;
  delete document.__webdriver;

  // ----- 2. ChromeDriver / Phantom 注入变量 -------------------------------
  for (const k of Object.keys(window)) {
    if (k.startsWith('$cdc_') || k.startsWith('$chrome_') || k.startsWith('$wdc_')) {
      try { delete window[k]; } catch (_) {}
    }
  }
  for (const p of ['callPhantom', '_phantom', '__phantomas',
                   '__playwright', '__pw_manual', '__PW_inspect', 'playwright',
                   '__webdriverFunc', '__driver_evaluate', '__webdriver_evaluate',
                   '__selenium_evaluate', '__fxdriver_evaluate', '__driver_unwrapped',
                   '__webdriver_unwrapped', '__selenium_unwrapped', '__fxdriver_unwrapped',
                   '__webdriver_script_fn', '__webdriver_script_func',
                   'domAutomation', 'domAutomationController']) {
    try {
      delete window[p];
      Object.defineProperty(window, p, { get: () => undefined, configurable: true });
    } catch (_) {}
  }

  // ----- 3. window.chrome 完整补齐 ---------------------------------------
  // headless / Playwright 默认没有 chrome 对象，security-js 会探测 chrome.runtime
  if (!window.chrome) window.chrome = {};
  const c = window.chrome;
  c.runtime = c.runtime || {
    id: undefined,
    connect: () => ({ onMessage: { addListener: () => {} }, postMessage: () => {} }),
    sendMessage: (_id, _msg, cb) => { if (cb) setTimeout(cb, 10); },
    onMessage: { addListener: () => {}, removeListener: () => {} },
    onConnect: { addListener: () => {} },
    getManifest: () => undefined,
    getURL: (p) => 'chrome-extension://' + p,
    lastError: null,
  };
  c.loadTimes = c.loadTimes || function () {
    const t = Date.now() / 1000;
    return {
      commitLoadTime: t - 8, connectionInfo: 'h2',
      finishDocumentLoadTime: t - 5, finishLoadTime: t - 2,
      firstPaintAfterLoadTime: 0, firstPaintTime: t - 7,
      navigationType: 'Other', npnNegotiatedProtocol: 'h2',
      requestTime: t - 12, startLoadTime: t - 10,
      wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: true, wasNpnNegotiated: true,
    };
  };
  c.csi = c.csi || function () {
    return { onloadT: Date.now(), pageT: 1000, startE: Date.now() - 3000, tran: 15 };
  };
  c.app = c.app || {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
  };

  // ----- 4. Navigator 属性伪装 -------------------------------------------
  // platform 必须跟 UA 一致 —— Windows UA + 'Win32'
  // 全部用 Navigator.prototype 重定义，规避 instance vs prototype 对比检测
  // 注意：绝不伪造 hardwareConcurrency / deviceMemory —— 之前硬编码成 8，但真机是 28 核，
  // 与真实环境矛盾，反而被反爬交叉比对识破。这类「机器相关」字段一律放真实值，保持自洽。
  const navProps = {
    languages: ['zh-CN', 'zh', 'en-US', 'en'],
    vendor: 'Google Inc.',
    platform: 'Win32',
    maxTouchPoints: 0,
  };
  const navProto = Object.getPrototypeOf(navigator);
  for (const [k, v] of Object.entries(navProps)) {
    try {
      Object.defineProperty(navProto, k, { get: () => v, configurable: true });
    } catch (_) {
      try { Object.defineProperty(navigator, k, { get: () => v, configurable: true }); } catch (__) {}
    }
  }

  // ----- 4.5 Client Hints (userAgentData) 一致性 -------------------------
  // 现代 Chromium 检测会读 navigator.userAgentData.platform / brands，
  // 与 UA / Sec-CH-UA / navigator.platform 必须四方自洽
  try {
    const brands = [
      { brand: 'Chromium', version: '135' },
      { brand: 'Not.A/Brand', version: '24' },
      { brand: 'Google Chrome', version: '135' },
    ];
    const uaData = {
      brands,
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: (keys) => Promise.resolve({
        architecture: 'x86',
        bitness: '64',
        brands,
        fullVersionList: brands.map(b => ({ brand: b.brand, version: b.version + '.0.0.0' })),
        mobile: false,
        model: '',
        platform: 'Windows',
        platformVersion: '15.0.0',
        uaFullVersion: '135.0.0.0',
        wow64: false,
        ...Object.fromEntries((keys || []).map(k => [k, undefined])),
      }),
      toJSON: () => ({ brands, mobile: false, platform: 'Windows' }),
    };
    Object.defineProperty(navProto, 'userAgentData', { get: () => uaData, configurable: true });
  } catch (_) {}

  // ----- 5. plugins / mimeTypes 伪造 -------------------------------------
  // navigator.plugins.length === 0 是 headless 的 tell-tale
  const fakePlugins = [
    { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
    { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
    { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
    { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: '' },
  ];
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = fakePlugins.map(p => ({ ...p, length: 1, item: () => null, namedItem: () => null }));
        arr.item = (i) => arr[i] || null;
        arr.namedItem = (n) => arr.find(p => p.name === n) || null;
        arr.refresh = () => {};
        return arr;
      },
      configurable: true,
    });
  } catch (_) {}

  // ----- 6. permissions.query 修正 ---------------------------------------
  // headless 下 Notification.permission === 'denied' 但 permissions.query 返回 'default'，矛盾
  if (navigator.permissions && navigator.permissions.query) {
    const orig = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) =>
      params && params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission, onchange: null })
        : orig(params);
  }

  // ----- 7. WebGL 指纹 ---------------------------------------------------
  // 【已移除 GPU 伪装】曾把 UNMASKED_VENDOR/RENDERER 硬编码成 Intel Iris Xe，但真机是 NVIDIA RTX 4060Ti，
  // 这种不一致的假显卡反而是强 bot 信号（反爬会交叉比对）。现放真实 GPU——真实且自洽，最不易被识破。
  // 不再改写 WebGLRenderingContext.prototype.getParameter。

  // ----- 8. screen 一致性 ------------------------------------------------
  // availWidth/availHeight 不能为 0
  try {
    if (screen.availWidth === 0) Object.defineProperty(screen, 'availWidth', { get: () => screen.width });
    if (screen.availHeight === 0) Object.defineProperty(screen, 'availHeight', { get: () => screen.height - 40 });
    if (window.outerWidth === 0) Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
    if (window.outerHeight === 0) Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
  } catch (_) {}

  // ----- 9. Function.prototype.toString 守护 -----------------------------
  // 反爬常把 navigator.permissions.query.toString() 拿来匹配 [native code]
  // 我们把被覆盖过的几个方法标记成 [native code]
  // 只有仍被改写的方法才需要伪装 toString。WebGL getParameter 已不再改写（放真实 GPU），故移除。
  const patched = new WeakSet();
  for (const fn of [
    navigator.permissions && navigator.permissions.query,
  ]) {
    if (typeof fn === 'function') patched.add(fn);
  }
  const origToString = Function.prototype.toString;
  Function.prototype.toString = function () {
    if (patched.has(this)) return 'function ' + (this.name || '') + '() { [native code] }';
    return origToString.call(this);
  };
})();
