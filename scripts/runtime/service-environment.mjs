/** Preserve local configuration aliases without placing credentials in argv. */
export function serviceEnvironment(root, settings, configured, platform = process.platform) {
  const env = { ...configured, KAI_SUPERVISED: '1', SERVER_PORT: configured.FORGE_BACKEND_PORT || '18080',
    TOOLBOX_SYSTEM_SUPERVISOR_PORT: String(settings.port) };
  env.TOOLBOX_WHISPER_MODE ||= platform === 'darwin' ? 'asr-service' : 'cli';
  env.TOOLBOX_AUTO_UPDATE_ENABLED ||= 'true';
  env.TOOLBOX_AUTO_UPDATE_REPOSITORY ||= root;
  env.TOOLBOX_ARIA2_BINARY ||= env.ARIA2_BIN || 'aria2c';
  env.WHISPER_DEVICE ||= platform === 'darwin' ? 'cpu' : 'cuda';
  env.WHISPER_COMPUTE_TYPE ||= env.WHISPER_DEVICE === 'cpu' ? 'int8' : 'float16';
  const spring = JSON.parse(env.SPRING_APPLICATION_JSON || '{}');
  if (env.TOOLBOX_QDRANT_API_KEY) {
    for (const feature of ['ai-secretary', 'visitor-analysis']) {
      spring[`toolbox.${feature}.rag.enabled`] ??= true;
      spring[`toolbox.${feature}.rag.qdrant-host`] ??= env.TOOLBOX_QDRANT_HOST || '127.0.0.1';
      spring[`toolbox.${feature}.rag.qdrant-port`] ??= Number(env.TOOLBOX_QDRANT_PORT || 6334);
      spring[`toolbox.${feature}.rag.qdrant-api-key`] ??= env.TOOLBOX_QDRANT_API_KEY;
    }
  }
  if (Object.keys(spring).length) env.SPRING_APPLICATION_JSON = JSON.stringify(spring);
  const observability = settings.observability || env.FORGE_OBSERVABILITY || 'external';
  if (observability === 'phoenix') {
    env.TOOLBOX_OBSERVABILITY_ENABLED = 'true';
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||= `http://127.0.0.1:${env.FORGE_PHOENIX_PORT || 16006}/v1/traces`;
  } else if (observability === 'langfuse') {
    env.TOOLBOX_OBSERVABILITY_ENABLED = String(Boolean(env.LANGFUSE_BASE_URL && env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY));
  } else if (observability === 'off') {
    env.TOOLBOX_OBSERVABILITY_ENABLED = 'false';
    for (const key of Object.keys(env)) if (key.startsWith('OTEL_') || key.startsWith('LANGFUSE_')) delete env[key];
  } else if (observability !== 'external') throw new Error('Observability must be external, phoenix, langfuse or off');
  return env;
}
