import { existsSync, realpathSync, readdirSync, statSync } from 'node:fs';
import { dirname, delimiter, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export function executable(name, configured, env = process.env) {
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const candidates = [];
  if (configured) {
    candidates.push(configured);
    for (const suffix of suffixes) candidates.push(join(configured, 'bin', name + suffix), join(configured, name + suffix));
  } else {
    for (const folder of (env.PATH || env.Path || '').split(delimiter)) {
      for (const suffix of suffixes) candidates.push(join(folder, name + suffix));
    }
  }
  const found = candidates.find(file => existsSync(file) && statSync(file).isFile());
  if (!found) throw new Error(`Cannot find ${name}; configure its path in scripts/run-tools.d/10-runtime.conf or PATH`);
  return realpathSync(found);
}

export function npmCommand(env = process.env) {
  const npm = executable('npm', env.NPM_CMD, env);
  const candidates = [npm.endsWith('.js') ? npm : '', join(dirname(npm), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(npm), '../lib/node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find(file => file && existsSync(file));
  if (!cli) throw new Error('Cannot locate npm-cli.js next to npm; install the standard Node distribution');
  return { file: process.execPath, args: [resolve(cli)] };
}

/** Maven's own Java entry avoids shell quoting and .cmd execution on Windows. */
export function mavenCommand(root, env = process.env) {
  const mvn = executable('mvn', env.MVN_CMD, env);
  const home = resolve(dirname(mvn), '..');
  const boot = join(home, 'boot');
  const launcher = existsSync(boot) && readdirSync(boot).find(name => /^plexus-classworlds-.*\.jar$/.test(name));
  if (!launcher) throw new Error('Maven distribution not found; set MVN_CMD to the actual Maven bin/mvn executable');
  const java = executable('java', env.JAVA_CMD || env.JAVA_HOME, env);
  // JVM options are JSON arrays, never evaluated as a shell string.
  const extra = JSON.parse(env.FORGE_MAVEN_JVM_ARGS || '[]');
  if (!Array.isArray(extra) || extra.some(value => typeof value !== 'string')) throw new Error('FORGE_MAVEN_JVM_ARGS must be a JSON string array');
  return { file: java, args: [...extra, '-Dfile.encoding=UTF-8', '-classpath', join(boot, launcher),
    `-Dclassworlds.conf=${join(home, 'bin/m2.conf')}`, `-Dmaven.home=${home}`,
    `-Dmaven.multiModuleProjectDirectory=${root}`, 'org.codehaus.plexus.classworlds.launcher.Launcher'] };
}

export function run(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command.file, [...command.args, ...args], {
      cwd: options.cwd, env: options.env || process.env, stdio: 'inherit', windowsHide: true, shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolveResult() : reject(new Error(`Command failed (${code ?? signal}): ${command.file}`)));
  });
}
