/**
 * ZODIAC OPS CENTER - DATA SYNC SERVICE v5.11
 *
 * Changes from v5.10:
 *   - Judge rubric renamed to match poster structure (data keys unchanged):
 *     content→選題需求, design→病生理深度, creativity→視覺表達, total→整體印象
 *     (header labels only; scoring/weighting logic identical)
 *
 * Changes from v5.9:
 *   - Averages now IGNORE judges who haven't submitted (0-cells excluded)
 *     → rankings correct mid-event, not dragged down by absent judges
 *   - Live "已送出 X / 3 位評審" status cell at V1
 *
 * Changes from v5.8:
 *   - 整體總分 renamed 整體印象 (holistic 1-5, not a sum of the 3 dims)
 *   - Final score = 50% avg(content,design,creativity) + 50% impression
 *     (col 19 weighted formula; col 18 now 均分_整體印象, was dup of 創意)
 *
 * Changes from v5.7:
 *   - New 20-col "海報評審" sheet: 組別|元素|A×4|B×4|C×4|均分×4|★最終總分|排名
 *   - AVERAGE + RANK formulas auto-written on sheet creation
 *   - loginJudge: auto-assign slot (A/B/C) by arrival order, PIN verification
 *   - Shared constants (JUDGE_COL/NAME_ROW/PIN_ROW) across both handlers
 */

var GAS_SECRET = "zodiac-2026-cmuh"; // must match CONFIG.GAS_SECRET in zzzzzz.html

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Server busy, please retry.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("No data received");

    var data = JSON.parse(e.postData.contents);

    if (data.secret !== GAS_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Forbidden' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Judge login / slot claim ────────────────────────────────────────
    if (data.action === 'loginJudge') {
      return handleLoginJudge(data);
    }

    // ── Judge scoring (external teachers) ──────────────────────────────
    if (data.action === 'judgeScore') {
      return handleJudgeScore(data);
    }

    var sessionId = data.sessionId;
    var rowsPayload = data.rows || [];
    if (!sessionId) throw new Error("Missing session ID");

    // 依學號排序，確保名單整齊
    rowsPayload.sort(function(a, b) { return (a.studentId || "").toString().localeCompare((b.studentId || "").toString()); });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sessionId);
    if (!sheet) sheet = ss.insertSheet(sessionId);

    var headers = [
      "學號 (ID)",                "姓名 (Name)",              "生肖 (Zodiac)",
      "總分 (Score)",              "連線狀態",
      "Group A: 校準 (5%)",       "Group A: 閱讀 (15%)",      "Group A: 互動 (15%)",
      "Group A: 測驗 (25%)",      "Group A: 反思 (10%)",
      "Group B: 作業/專案 (15%)", "Group B: 角色",            "Group B: 協作貢獻",
      "Group B: 展覽完成",
      "心得內容 (Feedback)",       "課末自評分 (1-5)",          "學習反思",
      "組長領導心得",               "暖身信心 (1-5)",
      "異常標記 (Speedrun)",       "最後連線時間",
      "海報票選分"
    ]; // 22 欄

    // 永遠明確寫入第 1 列標題（避免 appendRow 因 lastRow 偏移導致標題消失）
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
         .setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");

    // 清除舊資料列，保留標題
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    }

    // 計分與欄位映射
    var outputRows = rowsPayload.map(function(r) {
      var score = 0, tags = [];

      if (r.calibration === 1) score += 5;
      if (r.rating      === 1) score += 10;
      if (r.assignment  === 1) score += 15;
      if (r.gallery     === 1) score += 15;  // v5.3: gallery 納入計分

      if (r.notebook === 1) {
        var d = Number(r.notebook_duration) || 0;
        if (d > 0 && d < 15) { score += 5;  tags.push('閱讀過快('+d+'s)'); } else { score += 15; }
      }
      if (r.slido === 1) {
        var d = Number(r.slido_duration) || 0;
        if (d > 0 && d < 5)  { score += 5;  tags.push('互動秒關('+d+'s)'); } else { score += 15; }
      }
      if (r.forms === 1) {
        var d = Number(r.forms_duration) || 0;
        if (d > 0 && d < 20) { score += 10; tags.push('測驗秒填('+d+'s)'); } else { score += 25; }
      }
      if (r.role === 'leader') {
        score += Math.min(10, (Number(r.leader_rating) || 0) * 2);
      }

      var contribCount = r.contributions ? r.contributions.split(' | ').filter(Boolean).length : 0;
      score += Math.min(9, contribCount * 3);

      score += Number(r.poster_score) || 0;

      var now = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");

      return [
        r.studentId || "",                                                                        //  1 學號
        r.name      || "",                                                                        //  2 姓名
        r.zodiac    || "",                                                                        //  3 生肖
        score,                                                                                    //  4 總分
        "已同步",                                                                                  //  5 連線狀態
        r.calibration === 1 ? "OK" : "",                                                         //  6 校準
        r.notebook    === 1 ? ((r.notebook_duration || 0) + "s") : "",                          //  7 閱讀
        r.slido       === 1 ? ((r.slido_duration    || 0) + "s") : "",                          //  8 互動
        r.forms       === 1 ? ((r.forms_duration    || 0) + "s") : "",                          //  9 測驗
        r.rating      === 1 ? "OK" : "",                                                         // 10 反思
        r.assignment  === 1 ? "OK(15)" : "",                                                     // 11 作業/專案
        r.assignment_role === 'leader' ? "組長" : (r.assignment_role === 'member' ? "組員" : ""), // 12 角色
        r.contributions || "",                                                                    // 13 協作貢獻
        r.gallery     === 1 ? "OK(15)" : "",                                                     // 14 展覽完成
        r.feedback      || "",                                                                    // 15 心得 (plain text)
        r.self_score    || "",                                                                    // 16 課末自評分
        r.reflection    || "",                                                                    // 17 學習反思
        r.leader_review || "",                                                                    // 18 組長領導心得
        r.calibration_confidence || "",                                                           // 19 暖身信心
        tags.join(", "),                                                                          // 20 異常標記
        now,                                                                                      // 21 最後連線時間
        Number(r.poster_score) || 0                                                               // 22 海報票選分
      ];
    });

    if (outputRows.length > 0) {
      sheet.getRange(2, 1, outputRows.length, headers.length).setValues(outputRows);
    }

    // 同步時間戳記寫在第 20 欄第 1 列（標題列右側）
    var nowHeader = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
    sheet.getRange(1, headers.length + 1).setValue("最後同步: " + nowHeader);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      rowCount: outputRows.length,
      message: '已成功同步 ' + outputRows.length + ' 筆資料至 [' + sessionId + ']'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ── Shared sheet constants ─────────────────────────────────────────────
var JUDGE_SHEET   = "海報評審";
var ZODIAC_ORDER  = ['子鼠','丑牛','寅虎','卯兔','辰龍','巳蛇','午馬','未羊','申猴','酉雞','戌狗','亥豬'];
var ZODIAC_ELEM   = {'子鼠':'水','丑牛':'土','寅虎':'木','卯兔':'木','辰龍':'土','巳蛇':'火','午馬':'火','未羊':'土','申猴':'氣','酉雞':'氣','戌狗':'土','亥豬':'水'};
// Col layout: 1=組別 2=元素 | 3-6=評審A | 7-10=評審B | 11-14=評審C | 15-18=均分 | 19=最終總分 | 20=排名
var JUDGE_COL     = { A: 3, B: 7, C: 11 };  // start col of each judge's 4-col block
var NAME_ROW      = 15;
var PIN_ROW       = 16;
var EMAIL_ROW     = 17;

function getOrCreateJudgeSheet_() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(JUDGE_SHEET);
  if (!sheet) sheet = ss.insertSheet(JUDGE_SHEET);

  // Always refresh headers (idempotent — safe to run on existing sheets)
  var headers = [
    "組別","元素",
    "評審A_選題需求","評審A_病生理深度","評審A_視覺表達","評審A_整體印象",
    "評審B_選題需求","評審B_病生理深度","評審B_視覺表達","評審B_整體印象",
    "評審C_選題需求","評審C_病生理深度","評審C_視覺表達","評審C_整體印象",
    "均分_選題需求","均分_病生理深度","均分_視覺表達","均分_整體印象",
    "★ 最終總分 (50%面向+50%印象)","排名"
  ];
  sheet.getRange(1,1,1,headers.length).setValues([headers])
       .setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");

  // Fill zodiac + element in col A-B for rows 2-13 (safe to overwrite labels)
  var zodiacRows = ZODIAC_ORDER.map(function(z) {
    return [z, ZODIAC_ELEM[z]||''];
  });
  sheet.getRange(2,1,zodiacRows.length,2).setValues(zodiacRows);

  // Avg + weighted final + rank formulas — always refresh (cols 15-20)
  // Averages IGNORE judges who haven't submitted (their cells are 0; scores are
  // always 1-5 so 0 reliably = not submitted). Pattern: SUM / count-of-nonzero.
  // Final score = 50% (avg of 3 dimensions) + 50% (overall impression).
  for (var r = 2; r <= 13; r++) {
    sheet.getRange(r,15).setFormula('=IFERROR(ROUND((C'+r+'+G'+r+'+K'+r+')/((C'+r+'>0)+(G'+r+'>0)+(K'+r+'>0)),1),"")');  // 均分_內容
    sheet.getRange(r,16).setFormula('=IFERROR(ROUND((D'+r+'+H'+r+'+L'+r+')/((D'+r+'>0)+(H'+r+'>0)+(L'+r+'>0)),1),"")');  // 均分_視覺
    sheet.getRange(r,17).setFormula('=IFERROR(ROUND((E'+r+'+I'+r+'+M'+r+')/((E'+r+'>0)+(I'+r+'>0)+(M'+r+'>0)),1),"")');  // 均分_創意
    sheet.getRange(r,18).setFormula('=IFERROR(ROUND((F'+r+'+J'+r+'+N'+r+')/((F'+r+'>0)+(J'+r+'>0)+(N'+r+'>0)),1),"")');  // 均分_整體印象
    sheet.getRange(r,19).setFormula('=IFERROR(ROUND(AVERAGE(O'+r+',P'+r+',Q'+r+')*0.5 + R'+r+'*0.5, 2),"")'); // ★最終總分
    sheet.getRange(r,20).setFormula('=IFERROR(RANK(S'+r+',S$2:S$13,0),"")');                  // 排名
  }

  // Live submission-status cell (V1, col 22): counts judges whose score block has data
  sheet.getRange(1,22).setFormula('="已送出 "&((SUM(F2:F13)>0)+(SUM(J2:J13)>0)+(SUM(N2:N13)>0))&" / 3 位評審"')
       .setFontWeight("bold").setFontColor("#1d4ed8");

  // Highlight final score + rank columns
  sheet.getRange(2,19,12,2).setBackground("#1a2e1a").setFontColor("#4ade80").setFontWeight("bold");

  // Signature / PIN / Email row labels
  sheet.getRange(NAME_ROW,  1).setValue("評審簽名").setFontWeight("bold").setFontColor("#94a3b8");
  sheet.getRange(PIN_ROW,   1).setValue("識別碼").setFontWeight("bold").setFontColor("#334155");
  sheet.getRange(EMAIL_ROW, 1).setValue("電子郵件").setFontWeight("bold").setFontColor("#334155");

  return sheet;
}

// ── Judge login: auto-assign slot by arrival order ────────────────────
function handleLoginJudge(data) {
  var name  = (data.name  || '').trim();
  var pin   = (data.pin   || '').trim();
  var email = (data.email || '').trim();
  if (!name || !pin) throw new Error("Missing name or pin");

  var sheet = getOrCreateJudgeSheet_();
  var SLOTS = ['A','B','C'];
  var i, slot, col, storedName, storedPin;

  // Returning judge: name + PIN match
  for (i = 0; i < SLOTS.length; i++) {
    slot       = SLOTS[i];
    col        = JUDGE_COL[slot];
    storedName = (sheet.getRange(NAME_ROW, col).getValue()||'').toString().replace(/^✍ /,'').trim();
    storedPin  = (sheet.getRange(PIN_ROW,  col).getValue()||'').toString().trim();
    if (storedName === name && storedPin === pin) {
      return ContentService.createTextOutput(JSON.stringify({status:'ok', slot:slot, returning:true, scores:readJudgeScores_(sheet, col)}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Name matches but PIN wrong
  for (i = 0; i < SLOTS.length; i++) {
    slot       = SLOTS[i];
    col        = JUDGE_COL[slot];
    storedName = (sheet.getRange(NAME_ROW, col).getValue()||'').toString().replace(/^✍ /,'').trim();
    if (storedName === name) {
      return ContentService.createTextOutput(JSON.stringify({status:'error', message:'識別碼錯誤，請重新輸入'}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Claim next empty slot
  for (i = 0; i < SLOTS.length; i++) {
    slot       = SLOTS[i];
    col        = JUDGE_COL[slot];
    storedName = (sheet.getRange(NAME_ROW, col).getValue()||'').toString().trim();
    if (!storedName) {
      sheet.getRange(NAME_ROW,  col).setValue('✍ ' + name);
      sheet.getRange(PIN_ROW,   col).setValue(pin);
      if (email) sheet.getRange(EMAIL_ROW, col).setValue(email);
      return ContentService.createTextOutput(JSON.stringify({status:'ok', slot:slot, returning:false}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({status:'error', message:'三位評審名額已滿，請洽主辦單位'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Read a judge's existing scores from sheet (12 rows × 4 cols) ───────
function readJudgeScores_(sheet, col) {
  var block = sheet.getRange(2, col, 12, 4).getValues(); // rows 2-13, content/design/creativity/total
  return block.map(function(r) {
    return {
      content:    Number(r[0]) || 0,
      design:     Number(r[1]) || 0,
      creativity: Number(r[2]) || 0,
      total:      Number(r[3]) || 0
    };
  });
}

// ── External judge poster scoring ─────────────────────────────────────
function handleJudgeScore(data) {
  var judge      = data.judge;
  var judgeName  = data.judgeName  || '';
  var judgeEmail = data.judgeEmail || '';
  var rows       = data.rows;
  if (!judge || !rows || !rows.length) throw new Error("Missing judge or rows");
  if (!JUDGE_COL[judge]) throw new Error("Invalid judge id: " + judge);

  var sheet  = getOrCreateJudgeSheet_();
  var rowMap = {};
  ZODIAC_ORDER.forEach(function(z, i) { rowMap[z] = i + 2; });

  var col = JUDGE_COL[judge];
  rows.forEach(function(r) {
    var rowNum = rowMap[r.zodiac];
    if (!rowNum) return;
    sheet.getRange(rowNum, col, 1, 4).setValues([[
      Number(r.content)    || 0,
      Number(r.design)     || 0,
      Number(r.creativity) || 0,
      Number(r.total)      || 0
    ]]);
  });

  if (judgeName) sheet.getRange(NAME_ROW, col).setValue('✍ ' + judgeName);

  // Update email if provided; fallback to stored email
  if (judgeEmail) sheet.getRange(EMAIL_ROW, col).setValue(judgeEmail);
  var emailToSend = judgeEmail || (sheet.getRange(EMAIL_ROW, col).getValue() || '').toString().trim();

  var now = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
  sheet.getRange(1, 21).setValue('最後送出: ' + now);

  if (emailToSend) {
    try { sendConfirmationEmail_(emailToSend, judgeName, rows, now); } catch(e) {}
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: '評審 ' + judge + ' 已成功送出 ' + rows.length + ' 組評分',
    emailSent: !!emailToSend
  })).setMimeType(ContentService.MimeType.JSON);
}

// ── Confirmation email ────────────────────────────────────────────────
function sendConfirmationEmail_(email, name, rows, timestamp) {
  var honorific = name.match(/教授|老師|博士|主任|院長|所長|醫師|醫生|副教授/) ? name : name + '老師';
  var subject   = '【藥學系 Pathophysiology 海報評審】評分確認 — ' + honorific;

  var tableRows = '';
  rows.forEach(function(r) {
    tableRows +=
      '<tr>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #334155;color:#f8fafc;">' + r.zodiac + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #334155;color:#94a3b8;">' + (r.element || '') + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #334155;text-align:center;color:#e2e8f0;">' + r.content + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #334155;text-align:center;color:#e2e8f0;">' + r.design + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #334155;text-align:center;color:#e2e8f0;">' + r.creativity + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #334155;text-align:center;font-weight:700;color:#f59e0b;">' + r.total + '</td>' +
      '</tr>';
  });

  var html =
    '<div style="font-family:Segoe UI,sans-serif;background:#0f172a;padding:32px 16px;">' +
    '<div style="max-width:580px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">' +

    '<div style="text-align:center;margin-bottom:28px;">' +
    '<div style="font-size:40px;margin-bottom:10px;">🏆</div>' +
    '<h2 style="color:#f8fafc;font-size:20px;margin:0 0 6px;">海報評審確認信</h2>' +
    '<p style="color:#64748b;font-size:12px;margin:0;">Zodiac Ops Poster Review 2026</p>' +
    '</div>' +

    '<p style="color:#e2e8f0;font-size:14px;line-height:1.9;margin-bottom:24px;">' +
    '親愛的 <strong style="color:#f8fafc;">' + honorific + '</strong>，<br>' +
    '感謝您撥冗完成本次藥學系 Pathophysiology 課程海報評審。<br>' +
    '以下為您的完整評分紀錄，請確認無誤。' +
    '</p>' +

    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;background:#0f172a;border-radius:10px;overflow:hidden;">' +
    '<thead>' +
    '<tr style="background:#0f172a;">' +
    '<th style="padding:10px 12px;text-align:left;color:#60a5fa;font-weight:600;border-bottom:2px solid #1e293b;">組別</th>' +
    '<th style="padding:10px 12px;text-align:left;color:#60a5fa;font-weight:600;border-bottom:2px solid #1e293b;">元素</th>' +
    '<th style="padding:10px 12px;text-align:center;color:#60a5fa;font-weight:600;border-bottom:2px solid #1e293b;">選題需求</th>' +
    '<th style="padding:10px 12px;text-align:center;color:#60a5fa;font-weight:600;border-bottom:2px solid #1e293b;">病生理深度</th>' +
    '<th style="padding:10px 12px;text-align:center;color:#60a5fa;font-weight:600;border-bottom:2px solid #1e293b;">視覺表達</th>' +
    '<th style="padding:10px 12px;text-align:center;color:#f59e0b;font-weight:600;border-bottom:2px solid #1e293b;">整體印象</th>' +
    '</tr>' +
    '</thead>' +
    '<tbody>' + tableRows + '</tbody>' +
    '</table>' +

    '<div style="background:#172032;border-left:3px solid #3b82f6;border-radius:8px;padding:14px 16px;margin-bottom:24px;font-size:12px;color:#94a3b8;line-height:1.7;">' +
    '如需修改評分，請以原姓名及識別碼重新登入系統。<br>' +
    '評分資料已同步至主辦單位 Google Sheets。<br>' +
    '亦歡迎您於 Padlet 海報下方留言，給予同學鼓勵與回饋。' +
    '</div>' +

    '<p style="color:#475569;font-size:11px;text-align:center;margin:0;line-height:1.8;">' +
    '送出時間：' + timestamp + '（台灣時間）<br>' +
    'Zodiac Ops · China Medical University Hospital · 2026' +
    '</p>' +
    '</div></div>';

  MailApp.sendEmail({ to: email, subject: subject, htmlBody: html });
}
