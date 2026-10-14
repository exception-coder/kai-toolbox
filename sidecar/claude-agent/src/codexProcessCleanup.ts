import { execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'

/** A process exit alone does not establish that inherited output pipes have closed. */
export function waitForCodexClose(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if ((child.exitCode !== null || child.signalCode !== null)
    && child.stdout.destroyed && child.stderr.destroyed) return Promise.resolve(true)
  return new Promise(resolve => {
    const finish = (closed: boolean) => {
      clearTimeout(timer)
      child.removeListener('close', onClose)
      resolve(closed)
    }
    const onClose = () => finish(true)
    const timer = setTimeout(() => finish(false), timeoutMs)
    timer.unref?.()
    child.once('close', onClose)
  })
}

/** Collect only PID relationships and executable names, never arguments or environment. */
export async function codexCleanupSnapshot(child: ChildProcessWithoutNullStreams): Promise<Record<string, unknown>> {
  const state = {
    pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode,
    stdinClosed: child.stdin.destroyed, stdoutClosed: child.stdout.destroyed,
    stderrClosed: child.stderr.destroyed,
  }
  if (process.platform !== 'win32' || !child.pid) return { ...state, processInventory: 'unsupported' }
  const script = `$p=Get-CimInstance Win32_Process; $ids=@(${child.pid}); $rows=@(); for($i=0;$i -lt 16;$i++){ $next=@($p | Where-Object { $_.ProcessId -in $ids }); $rows+=@($next | Select-Object ProcessId,ParentProcessId,Name); $ids=@($p | Where-Object { $_.ParentProcessId -in $ids } | ForEach-Object { $_.ProcessId }); if($ids.Count -eq 0){break} }; ConvertTo-Json -Compress -InputObject @($rows | Select-Object -First 64)`
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 1500, maxBuffer: 32_768, windowsHide: true }, (error, stdout) => {
        if (error) return resolve({ ...state, processInventory: 'unavailable', inventoryCode: error.code })
        try { resolve({ ...state, processes: JSON.parse(stdout) }) }
        catch { resolve({ ...state, processInventory: 'invalid' }) }
      })
  })
}
