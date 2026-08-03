const PROJECT_PREFIX = 'bingo-simulator-client-';
const TEAM_SUFFIX = '-saimone-olas-projects.vercel.app';
const DEPLOYMENT_SLUG = /^[a-z0-9-]+$/;

/**
 * Allows configured production origins and only Vercel aliases owned by this
 * exact project/team pair. A generic *.vercel.app wildcard would let an
 * attacker host a credentialed client on their own Vercel account.
 */
export function isAllowedClientOrigin(
  origin: string,
  configuredOrigins: readonly string[],
): boolean {
  if (configuredOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return false;
    if (!hostname.startsWith(PROJECT_PREFIX) || !hostname.endsWith(TEAM_SUFFIX)) {
      return false;
    }

    const slug = hostname.slice(PROJECT_PREFIX.length, -TEAM_SUFFIX.length);
    return slug.length > 0 && DEPLOYMENT_SLUG.test(slug);
  } catch {
    return false;
  }
}
