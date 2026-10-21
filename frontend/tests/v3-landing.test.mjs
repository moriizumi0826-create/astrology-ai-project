import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../v3/entry.html', import.meta.url), 'utf8');
test('LP explains the service in static HTML and preserves English branding', () => {
  assert.match(html, /<title>無料ホロスコープ作成・3D天体マップ｜The Celestial Atelier<\/title>/);
  assert.match(html, /name="description" content="生年月日・出生時刻・出生地から/);
  assert.match(html, /A Sanctuary of Celestial Wisdom\./);
  assert.match(html, /無料でホロスコープを作成/);
  assert.match(html, /id="results"/);
  assert.match(html, /3Dマップで、天体の関係を見る/);
  assert.match(html, /時間を動かして、変化をたどる/);
  assert.match(html, /「星の見通し」とAIへの質問は有料プランの機能です/);
});

test('LP uses a local actual-map screenshot without replacing the birth form', () => {
  assert.match(html, /src="\/assets\/landing-3d-map.jpg"/);
  assert.ok(existsSync(new URL('../v3/assets/landing-3d-map.jpg', import.meta.url)));
  assert.doesNotMatch(html, /alt="Star chart"/);
  assert.match(html, /id="reading-form"/);
  for (const name of ['birth_date','birth_time','birthplace','timezone_name']) {
    assert.ok(html.includes(`name="${name}"`));
  }
});
