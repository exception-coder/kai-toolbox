import { ForgeConsultClient, type ClientCheckpoint } from '@kai/forge-consult-client';

/** The host integrates its real login flow. No shared Forge password/token is embedded in this module. */
export function connectConsultation(options: {
  forgeOrigin: string;
  getCurrentUserForgeToken: () => Promise<string>;
  checkpoint?: ClientCheckpoint;
}) {
  const client = new ForgeConsultClient({
    baseUrl: options.forgeOrigin,
    getAccessToken: options.getCurrentUserForgeToken,
    checkpoint: options.checkpoint,
    onCheckpoint: checkpoint => {
      // Scope persistence by the actual logged-in user; clear it on logout.
      sessionStorage.setItem('current-user:forge-consult-checkpoint', JSON.stringify(checkpoint));
    },
  });
  return client;
}
