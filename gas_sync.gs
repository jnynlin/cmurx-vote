/**
 * ZODIAC OPS CENTER - DATA SYNC SERVICE v5.6
 *
 * Changes from v5.5:
 *   - Add poster_score (海報票選分) column 22
 *   - Add contribution bonus to score (+3/item, max +9)
 *   - poster_score added to total score
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
