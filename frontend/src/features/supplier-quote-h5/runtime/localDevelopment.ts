const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isLocalDevelopmentHost(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase();
  return (
    LOCAL_DEVELOPMENT_HOSTS.has(normalizedHostname) ||
    normalizedHostname.startsWith("192.168.")
  );
}
