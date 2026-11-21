// Auto Release (.github/workflows/auto-release.yml) uses
// docs/releases/v<version>.md as both the annotated tag's message and the
// GitHub Release body. These checks run on the version-bump pull request, so
// missing or incomplete notes fail CI before anything reaches main.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const file = resolve(root, `docs/releases/v${version}.md`);

const SECTIONS = [
  'Summary',
  'Highlights',
  'Added',
  'Changed',
  'Fixed',
  'Removed',
  'Deprecated',
  'Security',
  'Breaking Changes',
  'Migration / Upgrade Guide',
  'Installation',
  'Known Issues',
  'Full Changelog',
];

/** `## Heading` → body, in file order. */
function sections(md) {
  return [...md.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map(([, title, body]) => ({ title: title.trim(), body: body.trim() }));
}

describe(`release notes for ${version}`, () => {
  it(`exist at docs/releases/v${version}.md`, () => {
    expect(existsSync(file), `Write docs/releases/v${version}.md before releasing ${version}.`).toBe(true);
  });

  const md = existsSync(file) ? readFileSync(file, 'utf8') : '';

  it('have every required section, in order, none empty', () => {
    const found = sections(md);
    expect(found.map((s) => s.title)).toEqual(SECTIONS);
    // A section with nothing to say reads "None.", never blank.
    for (const s of found) expect(s.body, `"## ${s.title}" is empty`).not.toBe('');
  });

  it('end with the compare link to this version', () => {
    const link = sections(md).find((s) => s.title === 'Full Changelog')?.body ?? '';
    expect(link).toMatch(new RegExp(`^https://github\\.com/habibiahmada/autumnnote-plus/compare/v\\d+\\.\\d+\\.\\d+\\.\\.\\.v${version.replaceAll('.', '\\.')}$`));
  });

  it('install this version, not one copied from older notes', () => {
    const pinned = [...md.matchAll(/autumnnote-plus(?:-react|-vue)?@(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    expect(pinned.length).toBeGreaterThan(0);
    expect(new Set(pinned)).toEqual(new Set([version]));
  });
});
