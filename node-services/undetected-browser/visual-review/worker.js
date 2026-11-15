'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { main } = require('./cli');
const { openRun } = require('./review');

async function work(root, id, runCli = main) {
  const run = await openRun(root, id);
  const marker = path.join(run.dir, 'worker.json');
  const record = status => fs.writeFile(marker, JSON.stringify({ status, pid: process.pid, at: Date.now() }), { mode: 0o600 });
  const controller = new AbortController();
  await record('RUNNING');
  const checkCancel = async () => {
    try { await fs.access(path.join(run.dir, 'cancel.request')); controller.abort(); }
    catch (error) { if (error.code !== 'ENOENT') controller.abort(); }
  };
  await checkCancel();
  const interval = setInterval(checkCancel, 1000);
  try {
    if (controller.signal.aborted) { await run.save({ status: 'CANCELLED_BEFORE_SEND' }); return; }
    await runCli(['review', '--id', id, '--data-dir', root, '--timeout', '600', '--brief-file', path.join(run.dir, 'brief.txt'),
      ...run.state.inputImages.flatMap(image => ['--image', image.path])], { signal: controller.signal });
  } catch {
    // cli persists its detailed state; do not export native browser errors or start another attempt.
    process.exitCode = 1;
  } finally { clearInterval(interval); await record('EXITED'); }
}

if (require.main === module) work(process.argv[2], process.argv[3]).catch(() => { process.exitCode = 1; });
module.exports = { work };
