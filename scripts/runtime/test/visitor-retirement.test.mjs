import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enabledServices } from '../services.mjs';
import { serviceEnvironment } from '../service-environment.mjs';

test('legacy visitor flag cannot start the retired sidecar', () => {
  const services = enabledServices({ FORGE_VISITOR_ANALYSIS_ENABLED: 'true', FORGE_WECHAT_ENABLED: 'false' }, { scope: 'all' });
  assert.ok(services.some(service => service.name === 'backend'));
  assert.ok(services.some(service => service.name === 'frontend'));
  assert.ok(!services.some(service => service.name === 'visitor-analysis' || service.port === 9600));
});

test('shared Qdrant configuration continues to reach AI secretary only', () => {
  const env = serviceEnvironment('.', { port: 18081 }, { TOOLBOX_QDRANT_API_KEY: 'test-key' });
  const spring = JSON.parse(env.SPRING_APPLICATION_JSON);
  assert.equal(spring['toolbox.ai-secretary.rag.enabled'], true);
  assert.equal(spring['toolbox.ai-secretary.rag.qdrant-api-key'], 'test-key');
  assert.ok(!Object.keys(spring).some(key => key.startsWith('toolbox.visitor-analysis.')));
});
