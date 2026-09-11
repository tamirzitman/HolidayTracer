import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';

/**
 * The version shown in the footer, taken from the one place it is written down.
 *
 * package.json is the source of truth and the only place to edit it, so what a
 * person reads at the bottom of the screen and what was actually released can
 * never drift apart. Inlined at build time, which is also what makes it honest:
 * a deployment carries the number the commit it was built from had.
 */
const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
