// Generated from mobile/forge-mobile.json by node mobile/scripts/mobile.mjs prepare.
export const FORGE_ORIGIN: string = "https://kai-tool.exception-coder.com";
export const FORGE_PATH: string = "/tools/claude-chat";
export const FORGE_PROXY_PERMISSION: string = "{\"javascriptProxyPermission\":{\"urlPermissionList\":[{\"scheme\":\"https\",\"host\":\"kai-tool.exception-coder.com\",\"port\":\"443\",\"path\":\"tools/\"}]}}";

export function isForgeUrl(value: string): boolean {
  if (value === FORGE_ORIGIN || value === FORGE_ORIGIN + '/') { return true; }
  if (!value.startsWith(FORGE_ORIGIN + '/tools/')) { return false; }
  try {
    const decoded = decodeURIComponent(value.split('?')[0].split('#')[0]);
    return !decoded.includes('/../') && !decoded.includes('/./') && !decoded.includes(String.fromCharCode(92));
  } catch { return false; }
}
