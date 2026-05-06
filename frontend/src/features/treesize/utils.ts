/** Returns true when the file's extension (case-insensitive) is in the backend-provided whitelist. */
export function isVideoFile(name: string, whitelist: readonly string[]): boolean {
  if (!whitelist || whitelist.length === 0) return false
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) return false
  const ext = name.slice(dot + 1).toLowerCase()
  return whitelist.includes(ext)
}
