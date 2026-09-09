import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

/** Own a direct child handle; never discover or stop unrelated services by port. */
export function measurementProcess(command, args, options) {
  const output = openSync(options.log, 'a', 0o600);
  let child;
  try {
    child = spawn(command.file, [...command.args, ...args], {
      cwd: options.cwd, env: options.env, stdio: ['ignore', output, output], windowsHide: true, shell: false,
    });
  } finally { closeSync(output); }
  let result;
  const done = new Promise(resolve => {
    child.once('error', () => { result = { code: null, error: 'Unable to start child; check executable configuration.' }; resolve(result); });
    child.once('exit', (code, signal) => { result = { code, signal }; resolve(result); });
  });
  return {
    done, get result() { return result; },
    async stop() {
      if (result) return;
      child.kill('SIGTERM');
      const timer = setTimeout(() => { if (!result) child.kill('SIGKILL'); }, 3000);
      try { await done; } finally { clearTimeout(timer); }
    },
  };
}
