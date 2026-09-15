import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test.describe.configure({ mode: 'serial' });

const MARKER = 'Muc kiem thu e2e luat';

function credentials(){
  try{
    const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
      .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
      .map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]));
    return env.ADMIN_USER&&env.ADMIN_PASS?{user:env.ADMIN_USER,pass:env.ADMIN_PASS}:null;
  }catch{ return null }
}

test('luật admin nhập hiện ra trang, và chữ nhập vào không bao giờ thành HTML', async ({ page }) => {
  test.skip(!credentials(), 'Cần .env.local có ADMIN_USER và ADMIN_PASS');
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  expect((await page.request.post('/api/admin/login', { headers:{Origin:origin}, data:credentials() })).status()).toBe(200);

  const before = (await (await page.request.get('/api/rules')).json()).rules.find(r => r.key === 'tug');

  try {
    const saved = await page.request.post('/api/admin/rules', { headers:{Origin:origin}, data:{
      key: 'tug', title: 'Kéo co ' + MARKER,
      quick: 'Thành phần | 10 VĐV ' + MARKER,
      notes: 'Lưu ý ' + MARKER,
      full: '1. Mục thử\n<script>alert(1)</script>\nNội dung | Quy định\nSố hiệp | 01' } });
    expect(saved.status(), await saved.text()).toBe(200);

    await page.reload();
    await page.locator('#rules-tab-0').click();
    const panel = page.locator('#rules-panel');
    await expect(panel.locator('.rules-title h3')).toHaveText('Kéo co ' + MARKER, { timeout: 15000 });
    await expect(panel.locator('.rule-summary dd')).toHaveText('10 VĐV ' + MARKER);
    await expect(panel.locator('.rule-notes li')).toHaveText('Lưu ý ' + MARKER);

    await panel.locator('.full-rule summary').click();
    await expect(panel.locator('.full-rule-content h4')).toHaveText('1. Mục thử');
    await expect(panel.locator('.rule-reference-table .rule-table-head')).toHaveText('Nội dung / Quy định');
    await expect(panel.locator('.rule-reference-table .rule-table-row')).toHaveText('Số hiệp01');

    expect(await panel.locator('.full-rule-content').evaluate(el => el.querySelector('script') !== null),
      'thẻ script do admin nhập không bao giờ được thành phần tử thật').toBe(false);
    await expect(panel.locator('.full-rule-content li').first()).toHaveText('<script>alert(1)</script>');
  } finally {
    if (before) await page.request.post('/api/admin/rules', { headers:{Origin:origin}, data:{ key:'tug', ...before.raw } });
    else await page.request.delete('/api/admin/rules', { headers:{Origin:origin}, data:{ key:'tug' } });
  }
});

test('chưa nhập gì thì mục Luật Thi Đấu vẫn hiện đúng nội dung nướng sẵn', async ({ page }) => {
  await page.goto('/');
  const rules = (await (await page.request.get('/api/rules')).json()).rules;
  test.skip(rules.some(r => r.key === 'aoe'), 'AOE đã bị ghi đè trong DB local');

  await page.locator('#rules-tab-3').click();
  const panel = page.locator('#rules-panel');
  await expect(panel.locator('.rules-title h3')).toHaveText('AOE', { timeout: 15000 });
  await expect(panel.locator('.rule-summary > div')).toHaveCount(3);
  await panel.locator('.full-rule summary').click();
  await expect(panel.locator('.rule-reference-table .rule-table-row')).toHaveCount(9);
});
