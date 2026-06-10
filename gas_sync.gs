/**
 * ZODIAC OPS CENTER - DATA SYNC SERVICE v5.7
 *
 * Changes from v5.6:
 *   - Add judgeScore action: writes external teacher poster scores to "海報評審" sheet
 *   - Sheet: 組別 | 評審A×4 | 評審B×4 | 評審C×4 (13 cols)
 */

const GAS_SECRET = "zodiac-2026-cmuh"; // must match CONFIG.GAS_SECRET in zzzzzz.html

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Server busy, please retry.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("No data received");

    const data = JSON.parse(e.postData.contents);

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

    const sessionId = data.sessionId;
    const rowsPayload = data.rows || [];
    if (!sessionId) throw new Error("Missing session ID");

    // 依學號排序，確保名單整齊
    rowsPayload.sort((a, b) => (a.studentId || "").toString().localeCompare((b.studentId || "").toString()));

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sessionId);
    if (!sheet) sheet = ss.insertSheet(sessionId);

    const headers = [
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
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    }

    // 計分與欄位映射
    const outputRows = rowsPayload.map(r => {
      let score = 0, tags = [];

      if (r.calibration === 1) score += 5;
      if (r.rating      === 1) score += 10;
      if (r.assignment  === 1) score += 15;
      if (r.gallery     === 1) score += 15;  // v5.3: gallery 納入計分

      if (r.notebook === 1) {
        const d = Number(r.notebook_duration) || 0;
        if (d > 0 && d < 15) { score += 5;  tags.push(`閱讀過快(${d}s)`); } else { score += 15; }
      }
      if (r.slido === 1) {
        const d = Number(r.slido_duration) || 0;
        if (d > 0 && d < 5)  { score += 5;  tags.push(`互動秒關(${d}s)`); } else { score += 15; }
      }
      if (r.forms === 1) {
        const d = Number(r.forms_duration) || 0;
        if (d > 0 && d < 20) { score += 10; tags.push(`測驗秒填(${d}s)`); } else { score += 25; }
      }
      if (r.role === 'leader') {
        score += Math.min(10, (Number(r.leader_rating) || 0) * 2);
      }

      const contribCount = r.contributions ? r.contributions.split(' | ').filter(Boolean).length : 0;
      score += Math.min(9, contribCount * 3);

      score += Number(r.poster_score) || 0;

      const now = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");

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
    const nowHeader = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
    sheet.getRange(1, headers.length + 1).setValue("最後同步: " + nowHeader);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      rowCount: outputRows.length,
      message: `已成功同步 ${outputRows.length} 筆資料至 [${sessionId}]`
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ── Shared sheet constants ─────────────────────────────────────────────
const JUDGE_SHEET   = "海報評審";
const ZODIAC_ORDER  = ['子鼠','丑牛','寅虎','卯兔','辰龍','巳蛇','午馬','未羊','申猴','酉雞','戌狗','亥豬'];
const ZODIAC_ELEM   = {'子鼠':'水','丑牛':'土','寅虎':'木','卯兔':'木','辰龍':'土','巳蛇':'火','午馬':'火','未羊':'土','申猴':'氣','酉雞':'氣','戌狗':'土','亥豬':'水'};
// Col layout: 1=組別 2=元素 | 3-6=評審A | 7-10=評審B | 11-14=評審C | 15-18=均分 | 19=最終總分 | 20=排名
const JUDGE_COL     = { A: 3, B: 7, C: 11 };  // start col of each judge's 4-col block
const NAME_ROW      = 15;
const PIN_ROW       = 16;

function getOrCreateJudgeSheet_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(JUDGE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(JUDGE_SHEET);
    const headers = [
      "組別","元素",
      "評審A_內容","評審A_視覺","評審A_創意","評審A_總分",
      "評審B_內容","評審B_視覺","評審B_創意","評審B_總分",
      "評審C_內容","評審C_視覺","評審C_創意","評審C_總分",
      "均分_內容","均分_視覺","均分_創意","均分_創意評分",
      "★ 最終總分","排名"
    ];
    sheet.getRange(1,1,1,headers.length).setValues([headers])
         .setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");

    // Pre-fill 12 zodiac rows with element
    const zodiacRows = ZODIAC_ORDER.map(z => [z, ZODIAC_ELEM[z]||'', 0,0,0,0, 0,0,0,0, 0,0,0,0, '','','','','','']);
    sheet.getRange(2,1,zodiacRows.length,20).setValues(zodiacRows);

    // Avg + rank formulas (rows 2–13)
    for (let r = 2; r <= 13; r++) {
      sheet.getRange(r,15).setFormula(`=IFERROR(AVERAGE(C${r},G${r},K${r}),"")`);  // 均分_內容
      sheet.getRange(r,16).setFormula(`=IFERROR(AVERAGE(D${r},H${r},L${r}),"")`);  // 均分_視覺
      sheet.getRange(r,17).setFormula(`=IFERROR(AVERAGE(E${r},I${r},M${r}),"")`);  // 均分_創意
      sheet.getRange(r,18).setFormula(`=IFERROR(AVERAGE(E${r},I${r},M${r}),"")`);  // 均分_創意評分 (same)
      sheet.getRange(r,19).setFormula(`=IFERROR(AVERAGE(F${r},J${r},N${r}),"")`);  // ★ 最終總分
      sheet.getRange(r,20).setFormula(`=IFERROR(RANK(S${r},S$2:S$13,0),"")`);      // 排名
    }
    // Highlight final score + rank columns
    sheet.getRange(2,19,12,2).setBackground("#1a2e1a").setFontColor("#4ade80").setFontWeight("bold");
    // Row 15: signature label
    sheet.getRange(NAME_ROW,1).setValue("評審簽名").setFontWeight("bold").setFontColor("#94a3b8");
    sheet.getRange(PIN_ROW, 1).setValue("識別碼").setFontWeight("bold").setFontColor("#334155");
  }
  return sheet;
}

// ── Judge login: auto-assign slot by arrival order ────────────────────
function handleLoginJudge(data) {
  const name = (data.name || '').trim();
  const pin  = (data.pin  || '').trim();
  if (!name || !pin) throw new Error("Missing name or pin");

  const sheet = getOrCreateJudgeSheet_();
  const SLOTS = ['A','B','C'];

  // Returning judge: name + PIN match
  for (const slot of SLOTS) {
    const col        = JUDGE_COL[slot];
    const storedName = (sheet.getRange(NAME_ROW, col).getValue()||'').toString().replace(/^✍ /,'').trim();
    const storedPin  = (sheet.getRange(PIN_ROW,  col).getValue()||'').toString().trim();
    if (storedName === name && storedPin === pin) {
      return ContentService.createTextOutput(JSON.stringify({status:'ok',slot,returning:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Name matches but PIN wrong
  for (const slot of SLOTS) {
    const col        = JUDGE_COL[slot];
    const storedName = (sheet.getRange(NAME_ROW, col).getValue()||'').toString().replace(/^✍ /,'').trim();
    if (storedName === name) {
      return ContentService.createTextOutput(JSON.stringify({status:'error',message:'識別碼錯誤，請重新輸入'}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Claim next empty slot
  for (const slot of SLOTS) {
    const col        = JUDGE_COL[slot];
    const storedName = (sheet.getRange(NAME_ROW, col).getValue()||'').toString().trim();
    if (!storedName) {
      sheet.getRange(NAME_ROW, col).setValue(`✍ ${name}`);
      sheet.getRange(PIN_ROW,  col).setValue(pin);
      return ContentService.createTextOutput(JSON.stringify({status:'ok',slot,returning:false}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({status:'error',message:'三位評審名額已滿，請洽主辦單位'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── External judge poster scoring ─────────────────────────────────────
function handleJudgeScore(data) {
  const judge     = data.judge;
  const judgeName = data.judgeName || '';
  const rows      = data.rows;
  if (!judge || !rows || !rows.length) throw new Error("Missing judge or rows");
  if (!JUDGE_COL[judge]) throw new Error("Invalid judge id: " + judge);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Write header row
    const headers = [
      "組別",
  const sheet  = getOrCreateJudgeSheet_();
  const rowMap = {};
  ZODIAC_ORDER.forEach((z, i) => { rowMap[z] = i + 2; });

  const col = JUDGE_COL[judge];
  rows.forEach(r => {
    const rowNum = rowMap[r.zodiac];
    if (!rowNum) return;
    sheet.getRange(rowNum, col, 1, 4).setValues([[
      Number(r.content)    || 0,
      Number(r.design)     || 0,
      Number(r.creativity) || 0,
      Number(r.total)      || 0
    ]]);
  });

  // Update name row (also done at login, but refresh here for safety)
  if (judgeName) sheet.getRange(NAME_ROW, col).setValue(`✍ ${judgeName}`);

  // Timestamp in col 21
  const now = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
  sheet.getRange(1, 21).setValue(`最後送出: ${now}`);

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: `評審 ${judge} 已成功送出 ${rows.length} 組評分`
  })).setMimeType(ContentService.MimeType.JSON);
}
