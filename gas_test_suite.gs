/**
 * ZODIAC OPS — GAS TEST SUITE
 *
 * Paste the entire contents of gas_sync.gs + this file into
 * the Apps Script editor, then run the desired test function.
 *
 * Functions:
 *   runAllTests()         — full suite (login × 3 + scores + email)
 *   runE2ETest3Judges()   — 3-judge end-to-end flow
 *   testEmailSend()       — send one confirmation email
 *   diagWhoAmI()          — show which Google account is executing
 *   diagMailQuota()       — remaining daily email quota
 *   cleanupTestData()     — remove test rows from 海報評審 sheet
 */

var TEST_EMAIL = 'cmuh.d5761@gmail.com';

// ── Helpers ───────────────────────────────────────────────────────────
var _pass = 0, _fail = 0;

function _test(label, fn) {
  try {
    fn();
    Logger.log('  ✅  ' + label);
    _pass++;
  } catch(e) {
    Logger.log('  ❌  ' + label + ' — ' + e.message);
    _fail++;
  }
}

function _assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function _parseGAS(result) {
  return JSON.parse(result.getContent());
}

function _makeRows(offset) {
  var zodiacs = ['子鼠','丑牛','寅虎','卯兔','辰龍','巳蛇','午馬','未羊','申猴','酉雞','戌狗','亥豬'];
  var elems   = ['水','土','木','木','土','火','火','土','氣','氣','土','水'];
  return zodiacs.map(function(z, i) {
    return {
      zodiac:     z,
      element:    elems[i],
      content:    ((i + offset)     % 5) + 1,
      design:     ((i + offset + 1) % 5) + 1,
      creativity: ((i + offset + 2) % 5) + 1,
      total:      ((i + offset + 3) % 5) + 1
    };
  });
}

function _ts() { return '_' + new Date().getTime(); }

// ── Diagnostics ───────────────────────────────────────────────────────
function diagWhoAmI() {
  Logger.log('Active user:    ' + Session.getActiveUser().getEmail());
  Logger.log('Effective user: ' + Session.getEffectiveUser().getEmail());
}

function diagMailQuota() {
  Logger.log('Remaining daily email quota: ' + MailApp.getRemainingDailyQuota());
}

// ── Email test ────────────────────────────────────────────────────────
function testEmailSend() {
  sendConfirmationEmail_(
    TEST_EMAIL,
    '測試評審',
    _makeRows(0),
    Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss')
  );
  Logger.log('Email sent — check inbox: ' + TEST_EMAIL);
}

// ── 3-Judge E2E ───────────────────────────────────────────────────────
function runE2ETest3Judges() {
  _pass = 0; _fail = 0;
  var ts = _ts();
  var judges = [
    { name: '評審甲' + ts, pin: '1111', email: TEST_EMAIL },
    { name: '評審乙' + ts, pin: '2222', email: TEST_EMAIL },
    { name: '評審丙' + ts, pin: '3333', email: TEST_EMAIL }
  ];

  Logger.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log(' E2E: 3-Judge Login + Score + Email');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  var slots = [];

  for (var j = 0; j < judges.length; j++) {
    var jd = judges[j];
    Logger.log('\n── Judge ' + (j+1) + ': ' + jd.name);

    // Login
    var login;
    _test('Judge ' + (j+1) + ' login → ok', function() {
      login = _parseGAS(handleLoginJudge({ name: jd.name, pin: jd.pin, email: jd.email }));
      _assert(login.status === 'ok', 'status=' + login.status + ' msg=' + login.message);
      _assert(login.slot, 'no slot returned');
      Logger.log('    slot=' + login.slot + (login.returning ? ' (returning)' : ' (new)'));
    });

    if (!login || login.status !== 'ok') continue;
    slots.push(login.slot);

    var scoreResp;
    _test('Judge ' + (j+1) + ' scores written', function() {
      scoreResp = _parseGAS(handleJudgeScore({
        judge:      login.slot,
        judgeName:  jd.name,
        judgeEmail: jd.email,
        rows:       _makeRows(j),
        timestamp:  new Date().toISOString()
      }));
      _assert(scoreResp.status === 'success', 'status=' + scoreResp.status + ' msg=' + scoreResp.message);
      Logger.log('    emailSent=' + scoreResp.emailSent);
    });
  }

  // Verify 3 distinct slots
  _test('All 3 slots are distinct (A, B, C)', function() {
    _assert(slots.length === 3, 'Only ' + slots.length + ' slots assigned');
    var unique = {};
    slots.forEach(function(s) { unique[s] = 1; });
    _assert(Object.keys(unique).length === 3, 'Duplicate slots: ' + slots.join(','));
  });

  // 4th judge should be rejected
  _test('4th judge rejected (全滿)', function() {
    var r = _parseGAS(handleLoginJudge({ name: '第四人' + ts, pin: '9999', email: '' }));
    _assert(r.status === 'error', 'Expected error, got ' + r.status);
    _assert(r.message.indexOf('名額已滿') >= 0, 'Expected 名額已滿, got: ' + r.message);
  });

  // Wrong PIN
  _test('Wrong PIN rejected', function() {
    var r = _parseGAS(handleLoginJudge({ name: judges[0].name, pin: '0000', email: '' }));
    _assert(r.status === 'error', 'Expected error');
    _assert(r.message.indexOf('識別碼錯誤') >= 0, 'Expected 識別碼錯誤, got: ' + r.message);
  });

  // Returning judge
  _test('Returning judge (same PIN) → returning=true', function() {
    var r = _parseGAS(handleLoginJudge({ name: judges[0].name, pin: judges[0].pin, email: '' }));
    _assert(r.status === 'ok', 'Expected ok, got ' + r.status);
    _assert(r.returning === true, 'Expected returning=true');
  });

  Logger.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log(' Results: ' + _pass + ' passed, ' + _fail + ' failed / ' + (_pass+_fail) + ' total');
  Logger.log(' Inbox ' + TEST_EMAIL + ': expect 3 confirmation emails');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// ── Full suite ────────────────────────────────────────────────────────
function runAllTests() {
  Logger.log('=== DIAG ===');
  diagWhoAmI();
  diagMailQuota();
  Logger.log('=== E2E 3 JUDGES ===');
  runE2ETest3Judges();
}

// ── Cleanup ───────────────────────────────────────────────────────────
function cleanupTestData() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(JUDGE_SHEET);
  if (!sheet) { Logger.log('Sheet not found'); return; }

  // Clear name / PIN / email rows (15-17) cols 3,7,11
  var cols = [JUDGE_COL.A, JUDGE_COL.B, JUDGE_COL.C];
  cols.forEach(function(col) {
    sheet.getRange(NAME_ROW,  col).clearContent();
    sheet.getRange(PIN_ROW,   col).clearContent();
    sheet.getRange(EMAIL_ROW, col).clearContent();
    // Clear score data (rows 2-13, 4 cols per judge)
    sheet.getRange(2, col, 12, 4).clearContent();
  });

  Logger.log('✅ Test data cleared from 海報評審 sheet');
}
