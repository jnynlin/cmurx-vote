/**
 * Stress test for handleLoginJudge + handleJudgeScore (GAS logic ported to Node.js)
 * Run: node stress_test_judge.js
 */

// ── Constants (mirrored from gas_sync.gs) ─────────────────────────────
const ZODIAC_ORDER = ['子鼠','丑牛','寅虎','卯兔','辰龍','巳蛇','午馬','未羊','申猴','酉雞','戌狗','亥豬'];
const ZODIAC_ELEM  = {'子鼠':'水','丑牛':'土','寅虎':'木','卯兔':'木','辰龍':'土','巳蛇':'火','午馬':'火','未羊':'土','申猴':'氣','酉雞':'氣','戌狗':'土','亥豬':'水'};
const JUDGE_COL    = { A: 3, B: 7, C: 11 };
const NAME_ROW     = 15;
const PIN_ROW      = 16;
const SLOTS        = ['A', 'B', 'C'];

// ── Mock Sheet ────────────────────────────────────────────────────────
function makeSheet() {
  const cells = {};
  const key   = (r, c) => r + ',' + c;
  return {
    get:  (r, c)    => (cells[key(r,c)] !== undefined ? cells[key(r,c)] : ''),
    set:  (r, c, v) => { cells[key(r,c)] = v; },
    dump: ()        => cells,
  };
}

// ── GAS logic (ported) ────────────────────────────────────────────────
function loginJudge(sheet, name, pin) {
  if (!name || !pin) return { status: 'error', message: 'Missing name or pin' };

  var i, slot, col, storedName, storedPin;

  // Returning
  for (i = 0; i < SLOTS.length; i++) {
    slot       = SLOTS[i];
    col        = JUDGE_COL[slot];
    storedName = (sheet.get(NAME_ROW, col)||'').toString().replace(/^✍ /,'').trim();
    storedPin  = (sheet.get(PIN_ROW,  col)||'').toString().trim();
    if (storedName === name && storedPin === pin)
      return { status: 'ok', slot: slot, returning: true, scores: readJudgeScores(sheet, col) };
  }

  // Wrong PIN
  for (i = 0; i < SLOTS.length; i++) {
    slot       = SLOTS[i];
    col        = JUDGE_COL[slot];
    storedName = (sheet.get(NAME_ROW, col)||'').toString().replace(/^✍ /,'').trim();
    if (storedName === name)
      return { status: 'error', message: '識別碼錯誤，請重新輸入' };
  }

  // Claim slot
  for (i = 0; i < SLOTS.length; i++) {
    slot       = SLOTS[i];
    col        = JUDGE_COL[slot];
    storedName = (sheet.get(NAME_ROW, col)||'').toString().trim();
    if (!storedName) {
      sheet.set(NAME_ROW, col, '✍ ' + name);
      sheet.set(PIN_ROW,  col, pin);
      return { status: 'ok', slot: slot, returning: false };
    }
  }

  return { status: 'error', message: '三位評審名額已滿，請洽主辦單位' };
}

function readJudgeScores(sheet, col) {
  var out = [];
  for (var r = 2; r <= 13; r++) {
    out.push({
      content:    Number(sheet.get(r, col))     || 0,
      design:     Number(sheet.get(r, col + 1)) || 0,
      creativity: Number(sheet.get(r, col + 2)) || 0,
      total:      Number(sheet.get(r, col + 3)) || 0
    });
  }
  return out;
}

function submitScores(sheet, judge, judgeName, rows) {
  if (!judge || !rows || !rows.length) return { status: 'error', message: 'Missing judge or rows' };
  if (!JUDGE_COL[judge])               return { status: 'error', message: 'Invalid judge id: ' + judge };

  var rowMap = {};
  ZODIAC_ORDER.forEach(function(z, i) { rowMap[z] = i + 2; });

  var col = JUDGE_COL[judge];
  rows.forEach(function(r) {
    var rowNum = rowMap[r.zodiac];
    if (!rowNum) return;
    sheet.set(rowNum, col,     Number(r.content)    || 0);
    sheet.set(rowNum, col + 1, Number(r.design)     || 0);
    sheet.set(rowNum, col + 2, Number(r.creativity) || 0);
    sheet.set(rowNum, col + 3, Number(r.total)      || 0);
  });

  if (judgeName) sheet.set(NAME_ROW, col, '✍ ' + judgeName);
  return { status: 'success', message: '評審 ' + judge + ' 已成功送出 ' + rows.length + ' 組評分' };
}

// ── Test harness ──────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log('  ✅  ' + label);
    passed++;
  } catch(e) {
    console.log('  ❌  ' + label);
    console.log('       ' + e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' — expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

// ── Make sample score rows ─────────────────────────────────────────────
function makeRows(c, d, cr, t) {
  return ZODIAC_ORDER.map(function(z) {
    return { zodiac: z, content: c, design: d, creativity: cr, total: t };
  });
}

// ─────────────────────────────────────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Judge Login Tests');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

var sheet = makeSheet();

test('T01 — 1st judge → slot A', function() {
  var r = loginJudge(sheet, '王大明', '1234');
  assertEqual(r.status,    'ok');
  assertEqual(r.slot,      'A');
  assertEqual(r.returning, false);
});

test('T02 — 2nd judge → slot B', function() {
  var r = loginJudge(sheet, '李小花', '5678');
  assertEqual(r.status,    'ok');
  assertEqual(r.slot,      'B');
  assertEqual(r.returning, false);
});

test('T03 — 3rd judge → slot C', function() {
  var r = loginJudge(sheet, '陳美麗', '9012');
  assertEqual(r.status,    'ok');
  assertEqual(r.slot,      'C');
  assertEqual(r.returning, false);
});

test('T04 — 4th person → 名額已滿', function() {
  var r = loginJudge(sheet, '張三', '3333');
  assertEqual(r.status, 'error');
  assert(r.message.includes('名額已滿'), 'Expected 名額已滿 message');
});

test('T05 — returning judge A correct PIN → slot A', function() {
  var r = loginJudge(sheet, '王大明', '1234');
  assertEqual(r.status,    'ok');
  assertEqual(r.slot,      'A');
  assertEqual(r.returning, true);
});

test('T06 — returning judge B correct PIN → slot B', function() {
  var r = loginJudge(sheet, '李小花', '5678');
  assertEqual(r.status,    'ok');
  assertEqual(r.slot,      'B');
  assertEqual(r.returning, true);
});

test('T07 — wrong PIN for judge A → 識別碼錯誤', function() {
  var r = loginJudge(sheet, '王大明', '0000');
  assertEqual(r.status, 'error');
  assert(r.message.includes('識別碼錯誤'), 'Expected PIN error message');
});

test('T08 — wrong PIN for judge C → 識別碼錯誤', function() {
  var r = loginJudge(sheet, '陳美麗', '1111');
  assertEqual(r.status, 'error');
  assert(r.message.includes('識別碼錯誤'), 'Expected PIN error message');
});

test('T09 — empty name → error', function() {
  var r = loginJudge(sheet, '', '1234');
  assertEqual(r.status, 'error');
});

test('T10 — empty PIN → error', function() {
  var r = loginJudge(sheet, '王大明', '');
  assertEqual(r.status, 'error');
});

test('T11 — name stored correctly (no prefix leak)', function() {
  var colA = JUDGE_COL['A'];
  var raw  = sheet.get(NAME_ROW, colA);
  assertEqual(raw, '✍ 王大明', 'Name stored with ✍ prefix');
  // Verify login strips prefix correctly on re-entry
  var r = loginJudge(sheet, '王大明', '1234');
  assertEqual(r.status, 'ok', 'Should still resolve after checking raw name');
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Score Submission Tests');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

test('T12 — judge A submits 12 rows → success', function() {
  var r = submitScores(sheet, 'A', '王大明', makeRows(4, 3, 5, 4));
  assertEqual(r.status, 'success');
  // Verify col 3 (content for A) of row 2 (子鼠)
  assertEqual(sheet.get(2, 3), 4, 'Content score written to col 3');
  assertEqual(sheet.get(2, 6), 4, 'Total score written to col 6');
});

test('T13 — judge B submits 12 rows → col 7', function() {
  var r = submitScores(sheet, 'B', '李小花', makeRows(5, 4, 4, 5));
  assertEqual(r.status, 'success');
  assertEqual(sheet.get(2, 7),  5, 'B content at col 7');
  assertEqual(sheet.get(2, 10), 5, 'B total at col 10');
});

test('T14 — judge C submits 12 rows → col 11', function() {
  var r = submitScores(sheet, 'C', '陳美麗', makeRows(3, 5, 4, 4));
  assertEqual(r.status, 'success');
  assertEqual(sheet.get(2, 11), 3, 'C content at col 11');
  assertEqual(sheet.get(2, 14), 4, 'C total at col 14');
});

test('T15 — A and B scores are independent (no overwrite)', function() {
  assertEqual(sheet.get(2, 3),  4, 'A content unchanged');
  assertEqual(sheet.get(2, 7),  5, 'B content unchanged');
  assertEqual(sheet.get(2, 11), 3, 'C content unchanged');
});

test('T16 — judge A re-submits (modify) → scores overwritten', function() {
  submitScores(sheet, 'A', '王大明', makeRows(5, 5, 5, 5));
  assertEqual(sheet.get(2, 3), 5, 'A content updated to 5');
  assertEqual(sheet.get(2, 6), 5, 'A total updated to 5');
  // B unchanged
  assertEqual(sheet.get(2, 7), 5, 'B content still 5');
});

test('T17 — invalid judge ID → error', function() {
  var r = submitScores(sheet, 'X', 'unknown', makeRows(3,3,3,3));
  assertEqual(r.status, 'error');
  assert(r.message.includes('Invalid'), 'Expected Invalid judge error');
});

test('T18 — missing rows → error', function() {
  var r = submitScores(sheet, 'A', '王大明', []);
  assertEqual(r.status, 'error');
});

test('T19 — unknown zodiac row skipped gracefully', function() {
  var badRows = [{ zodiac: '不存在', content: 3, design: 3, creativity: 3, total: 3 }];
  var r = submitScores(sheet, 'A', '王大明', badRows);
  assertEqual(r.status, 'success', 'Should succeed even with unknown zodiac (skipped)');
});

test('T20 — zero scores stored as 0 not falsy', function() {
  submitScores(sheet, 'A', '王大明', makeRows(0, 0, 0, 0));
  assertEqual(sheet.get(2, 3), 0, 'Zero stored as 0');
});

test('T21 — all 12 zodiac rows written correctly', function() {
  submitScores(sheet, 'A', '王大明', makeRows(4, 3, 5, 4));
  ZODIAC_ORDER.forEach(function(z, i) {
    var rowNum = i + 2;
    assert(sheet.get(rowNum, 3) === 4, z + ' content not written');
    assert(sheet.get(rowNum, 6) === 4, z + ' total not written');
  });
});

test('T22 — returning judge gets submitted scores back (revise bug fix)', function() {
  // Judge A already submitted (4,3,5,4) in T21. Re-login should return those scores.
  var r = loginJudge(sheet, '王大明', '1234');
  assertEqual(r.status, 'ok');
  assertEqual(r.returning, true);
  assert(Array.isArray(r.scores), 'scores array must be returned on revise');
  assertEqual(r.scores.length, 12, 'should return all 12 groups');
  assertEqual(r.scores[0].content, 4, 'content restored');
  assertEqual(r.scores[0].design, 3, 'design restored');
  assertEqual(r.scores[0].creativity, 5, 'creativity restored');
  assertEqual(r.scores[0].total, 4, 'total restored');
});

test('T23 — new judge login returns no scores (returning=false)', function() {
  // Fill B and C already taken; use fresh sheet to test new judge has empty scores
  var s2 = makeSheet();
  var r = loginJudge(s2, '新評審', '7777');
  assertEqual(r.returning, false);
  assert(r.scores === undefined, 'new judge should not get scores array');
});

// ── Summary ───────────────────────────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Results: ' + passed + ' passed, ' + failed + ' failed / ' + (passed+failed) + ' total');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
process.exit(failed > 0 ? 1 : 0);
