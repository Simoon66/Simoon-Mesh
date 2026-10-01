/**
 * Application environment configuration
 */

export function getSignalingUrl(): string {
  const envUrl = import.meta.env.VITE_SIGNALING_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
}

export function getAppName(): string {
  return import.meta.env.VITE_APP_NAME || 'SIMOON MESH';
}
