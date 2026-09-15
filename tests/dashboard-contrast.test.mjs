import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
test('image-backed project actions declare a dark surface with a strong scrim', () => {
  const project = readFileSync(new URL('../src/app/developer/projects/page.tsx', import.meta.url), 'utf8');
  assert.ok(project.includes('data-dashboard-surface={selectedHeroImage ? "dark" : "light"}'));
  assert.ok(project.includes('from-black/80 via-black/70 to-black/60'));
  assert.ok(project.includes('bg-black/60 text-white hover:bg-black/70'));
});
const luminance = (hex) => hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255)
  .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);

test('dashboard action palettes meet normal-text contrast, including disabled labels', () => {
  for (const [ink, surface] of [
    ['#050505', '#ffffff'], ['#525252', '#f1f5d9'], ['#525252', '#e5e5e5'],
    ['#ffffff', '#111211'], ['#e5e5e5', '#404040'], ['#ffffff', '#047857'],
    ['#065f46', '#ffffff'], ['#92400e', '#ffffff'], ['#9f1239', '#ffffff'],
    ['#1e40af', '#ffffff'], ['#394116', '#dff579'],
  ]) assert.ok(contrast(ink, surface) >= 4.5, `${ink} on ${surface}`);
});

test('both dashboards share nearest-surface foregrounds and light controls reset dark inheritance', () => {
  assert.match(css, /\.dashboard-shell,\s*\.dashboard-shell :is\(\.bg-white/);
  assert.match(css, /\[data-dashboard-surface="light"\]/);
  assert.match(css, /\[data-dashboard-surface="dark"\]/);
  assert.match(css, /\.dashboard-shell \.text-white,[\s\S]*?color: var\(--dashboard-ink\) !important/);
  assert.match(css, /\[class\*="text-white\/"\]/);
  assert.doesNotMatch(css, /\.glassless \.bg-black \.text-white/);
  for (const surface of ['bg-[#111]', 'bg-[#111211]', 'bg-[#101110]', 'bg-[#4d477f]']) {
    assert.ok(css.includes(`[class~="${surface}"]`), surface);
  }
});

test('disabled and long action labels remain readable instead of fading or truncating', () => {
  assert.match(css, /\.dashboard-shell button:disabled\s*\{[^}]*opacity: 1 !important/);
  assert.match(css, /\.dashboard-shell :is\(button, summary, \[role="button"\]\) \.truncate\s*\{[^}]*white-space: normal/);
  const claims = readFileSync(new URL('../src/components/GiftClaimsWorkspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(claims, /bg-emerald-600/);
});
