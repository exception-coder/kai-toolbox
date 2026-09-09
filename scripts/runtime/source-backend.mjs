import { join } from 'node:path';
import { mavenCommand, executable, run } from './commands.mjs';

export async function runBackend(root, settings, env, execute = run) {
  const startedAt = Date.now();
  const maven = mavenCommand(root, env);
  const goal = settings.mode === 'full' ? 'package' : 'install';
  console.log('[forge-stage] 编译 Java 模块');
  await execute(maven, ['-B', '-pl', 'toolbox-starter', '-am', '-Dskip.frontend=true', '-DskipTests', goal], { cwd: root, env });
  const options = ['-Dfile.encoding=UTF-8', `-Dtoolbox.performance.build-started-at=${startedAt}`];
  console.log(`[startup-performance] maven-${goal} durationMs=${Date.now() - startedAt}`);
  console.log('[forge-stage] 启动 Spring Boot，等待 HTTP 服务');
  if (settings.mode === 'full') {
    options.push('-Dtoolbox.performance.build-scope=maven-package', `-Dtoolbox.performance.build-duration-ms=${Date.now() - startedAt}`);
    await execute({ file: executable('java', env.JAVA_CMD || env.JAVA_HOME, env), args: options },
      ['-jar', join(root, 'toolbox-starter/target/kai-toolbox.jar')], { cwd: root, env });
  } else {
    options.push('-Dtoolbox.performance.build-scope=maven-before-jvm');
    const jvm = options.map(value => `"${value.replaceAll('"', '\\"')}"`).join(' ');
    await execute(maven, ['-B', '-pl', 'toolbox-starter', '-Dskip.frontend=true', 'spring-boot:run',
      `-Dspring-boot.run.jvmArguments=${jvm}`], { cwd: root, env });
  }
}
