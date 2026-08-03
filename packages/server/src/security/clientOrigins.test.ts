import { describe, expect, it } from 'vitest';
import { isAllowedClientOrigin } from './clientOrigins';

describe('client origin policy', () => {
  const configured = ['https://bingo-simulator-client-five.vercel.app'];

  it('accepts configured production and project-owned Vercel aliases', () => {
    expect(isAllowedClientOrigin(configured[0]!, configured)).toBe(true);
    expect(
      isAllowedClientOrigin(
        'https://bingo-simulator-client-git-main-saimone-olas-projects.vercel.app',
        configured,
      ),
    ).toBe(true);
    expect(
      isAllowedClientOrigin(
        'https://bingo-simulator-client-lnmln441m-saimone-olas-projects.vercel.app',
        configured,
      ),
    ).toBe(true);
  });

  it('rejects foreign, malformed and insecure origins', () => {
    expect(
      isAllowedClientOrigin(
        'https://bingo-simulator-client-main-attacker-projects.vercel.app',
        configured,
      ),
    ).toBe(false);
    expect(
      isAllowedClientOrigin(
        'https://bingo-simulator-client-main-saimone-olas-projects.vercel.app.evil.test',
        configured,
      ),
    ).toBe(false);
    expect(
      isAllowedClientOrigin(
        'http://bingo-simulator-client-main-saimone-olas-projects.vercel.app',
        configured,
      ),
    ).toBe(false);
  });
});
