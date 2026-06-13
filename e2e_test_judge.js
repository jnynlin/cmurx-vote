/**
 * End-to-end test: hits the real GAS endpoint
 * Simulates the full poster_judge.html flow:
 *   1. loginJudge  → get slot
 *   2. judgeScore  → submit scores + trigger email
 *
 * Run: node e2e_test_judge.js
 */

const https = require('https');

const GAS_URL    = 'https://script.google.com/macros/s/AKfycbzF6ntS5kGtvbvWeZLWkd_0qdjQnlSLJM0NiLifopAN64OyzSiqqL5ma3bul7quXZ1zGA/exec';
const GAS_SECRET = 'zodiac-2026-cmuh';
const TEST_EMAIL = 'cmuh.d5761@gmail.com';
const TEST_NAME  = 'E2E測試評審';
const TEST_PIN   = '9999';

const ZODIAC = [
  {label:'子鼠',element:'水'},{label:'丑牛',element:'土'},
  {label:'寅虎',element:'木'},{label:'卯兔',element:'木'},
  {label:'辰龍',element:'土'},{label:'巳蛇',element:'火'},
  {label:'午馬',element:'火'},{label:'未羊',element:'土'},
  {label:'申猴',element:'氣'},{label:'酉雞',element:'氣'},
  {label:'戌狗',element:'土'},{label:'亥豬',element:'水'},
];

function postGAS(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url  = new URL(GAS_URL);
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // GAS may redirect; follow if needed
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location);
          const redirOptions = {
            hostname: redirectUrl.hostname,
            path:     redirectUrl.pathname + redirectUrl.search,
            method:   'POST',
            headers:  { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) }
          };
          const req2 = https.request(redirOptions, res2 => {
            let data2 = '';
            res2.on('data', c => { data2 += c; });
            res2.on('end', () => {
              try { resolve(JSON.parse(data2)); } catch(e) { resolve({raw: data2}); }
            });
          });
          req2.on('error', reject);
          req2.write(body);
          req2.end();
        } else {
          try { resolve(JSON.parse(data)); } catch(e) { resolve({raw: data.slice(0,200)}); }
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' E2E Test — Real GAS Endpoint');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Step 1: loginJudge ─────────────────────────────────────────────
  console.log('Step 1: loginJudge...');
  const loginResp = await postGAS({
    action: 'loginJudge',
    secret: GAS_SECRET,
    name:   TEST_NAME,
    pin:    TEST_PIN,
    email:  TEST_EMAIL,
  });
  console.log('  Response:', JSON.stringify(loginResp));

  if (loginResp.status !== 'ok') {
    console.log('\n❌ Login failed:', loginResp.message);
    process.exit(1);
  }
  console.log('  ✅ Slot assigned:', loginResp.slot, loginResp.returning ? '(returning)' : '(new)');

  // ── Step 2: judgeScore ─────────────────────────────────────────────
  console.log('\nStep 2: judgeScore (12 rows + email)...');
  const rows = ZODIAC.map((z, i) => ({
    zodiac:     z.label,
    element:    z.element,
    content:    (i % 5) + 1,
    design:     ((i + 1) % 5) + 1,
    creativity: ((i + 2) % 5) + 1,
    total:      ((i + 3) % 5) + 1,
  }));

  const scoreResp = await postGAS({
    action:     'judgeScore',
    secret:     GAS_SECRET,
    judge:      loginResp.slot,
    judgeName:  TEST_NAME,
    judgeEmail: TEST_EMAIL,
    rows,
    timestamp:  new Date().toISOString(),
  });
  console.log('  Response:', JSON.stringify(scoreResp));

  if (scoreResp.status !== 'success') {
    console.log('\n❌ Score submission failed:', scoreResp.message);
    process.exit(1);
  }

  console.log('  ✅ Scores written to sheet');
  console.log('  ✅ Email sent:', scoreResp.emailSent ? 'yes' : 'no (no email stored)');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' All steps passed.');
  console.log(' Check inbox:', TEST_EMAIL);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
