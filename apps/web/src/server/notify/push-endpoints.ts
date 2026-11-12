const providers = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
  'web.push.apple.com',
];

/** Accept only HTTPS push-provider hosts and their dot-delimited subdomains. */
export function isAllowedPushEndpoint(url: string): boolean {
  try {
    const endpoint = new URL(url);
    return endpoint.protocol === 'https:'
      && !endpoint.username && !endpoint.password
      && (endpoint.port === '' || endpoint.port === '443')
      && providers.some(host => endpoint.hostname === host || endpoint.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}
