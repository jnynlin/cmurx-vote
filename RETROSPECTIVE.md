# Retrospective — Zodiac Ops 2026 (病理生理學海報評選)

A post-event review of the cmurx-vote poster-evaluation system, written so the next
cohort inherits the lessons, not just the code. Most problems this round were
**data-definition / process** issues, not engineering bugs — the architecture held.

---

## System at a glance

Three-layer, single-direction, read-only data flow (see `system_design.html`):

```
🔼 上游採集   index.html (學生投票) · poster_judge.html (評審) · zzzzzz.html (教師控制)
      ▼ 寫入
⏺ 中游儲存   Firebase Realtime DB (即時) + Google Sheet via GAS (結算)
      ▼ 唯讀
🔽 下游分析   master_console.html + 報告群 (全唯讀，不回寫原始資料)
```

Three independent evaluation lenses: **student Borda vote**, **external judge rubric
(50% 面向 + 50% 整體印象)**, **AI rubric (綜合分析, not graded)**. Individual grade
(circulation A, GAS) and poster competition (circulation B) meet at one crossover:
the group's vote points flow uncapped into each member's `poster_score`.

---

## What worked — keep these

| Strength | Why it mattered |
|---|---|
| **Vote conservation invariant** `total = N×6` | One arithmetic check proves no ballot stuffing. Cheap, bulletproof. |
| **Three independent lenses** | The *disagreements* were the richest teaching signal (e.g. 申猴/ATC: AI #1 but student #12 — depth ≠ appeal). |
| **Borda over raw popularity** | Resisted "biggest friend group wins." |
| **Transparent rubric over deep learning** | Correctly rejected DL — N=12 overfits. Explainability > black box at this scale. |
| **master_console as single live truth** | Once vote counts drifted, this kept every number honest. |
| **Gallery-gate non-voter distinction** | Separates 🔒未解鎖 (couldn't vote) from ⏭已解鎖未投 (didn't) — different actions. |

---

## The five lessons that cost the most

### 1. Voting was never formally closed
`status.votingClosed` stayed unset the whole event; live count drifted 231 → 244.
Every report that baked in a vote count went silently stale.
- **Fix next time:** "close voting" is a hard ritual that writes a timestamp. **No report
  bakes in a vote count** — read live, or read one frozen snapshot JSON. (This round we
  retrofitted drift-aware snapshot banners onto the static reports as a stopgap.)

### 2. Test/debug accounts polluted every analysis
`S1101`, `S1102`, `S111000999` inflated roster and non-voter counts until a
root-exclusion filter was added late (commit `cb11dd0`).
- **Fix next time:** test accounts live under a **separate session ID / namespace**,
  never in the production roster. A test ID sharing the production tree *will* leak into
  analytics. The canonical student-ID pattern is `S?11[1-4]003\d{3,4}` — anything else is
  not a real student.

### 3. Teamwork scored from extracted PDF text was systematically biased
First pass scored 團隊合作 from `pdftotext` signal counts. But most decks are
**rasterized images** (text not extractable), some used **names not 學號**, and some drew
process as **diagrams**. Image-based decks wrongly scored low. The headline
"team vs academic r ≈ −0.70" was a **measurement artifact** — on viewing rendered pages,
all 12 groups had complete contributor + division + process docs.
- **Fix next time:** **never score evidence from extracted text when artifacts may be
  images — render and view.** Better: collect teamwork evidence via a structured
  submission field, don't mine it out of the poster afterward.

### 4. The gallery-gate manufactured "non-voters"
Voting only unlocked after the gallery task, so many "didn't vote" were actually
"couldn't vote yet."
- **Fix next time:** decouple the right to vote from task completion, *or* surface the gate
  explicitly so a non-voter list means apathy, not a locked button.

### 5. Uncapped `poster_score` → individual grade
Deliberate, and documented: only no-cap keeps rank-1 members above rank-12 with no
overlap. But it yields a 63–169 individual-grade range with a 66-point gap driven purely
by **which group you were assigned to**.
- **Decide next time, consciously:** should group placement swing an individual grade that
  far? Or cap/compress it and let the poster competition be its own (separate) prize?

---

## Structural advice for the next class

- **Lock the identity map at submission time.** This round the gallery ZIP had sanitized
  CJK filenames, so `group# ↔ zodiac ↔ topic ↔ roster` had to be reverse-engineered by
  rendering every PDF. Capture that table when posters are submitted — never reconstruct
  it after the fact.
- **Consolidate the report sprawl.** ~10 report HTMLs with real overlap
  (`score_report`, `vote_report`, `analysis_report`, `poster_score_report`,
  `feedback_report`…). Fold into **2–3 living dashboards** off `master_console`; delete the
  rest. Fragmentation is where stale numbers hide.
- **Publish the rubric *before* the event.** AI/judge/student criteria public up front makes
  the scores formative, not just summative.
- **Snapshot-on-close.** Make taking the frozen snapshot JSON the official "results final"
  act; have every downstream report read *that file* after close, so nothing drifts.

---

## One-line summary

The system's bones are excellent. Next time, spend the same care on **data definition at
the source** — close states explicitly, namespace test data, capture mappings and teamwork
evidence in structured form rather than mining them back out, and decide deliberately how
much individual grade should ride on group assignment.

---

*Written 2026-06-14 after the 2026 cohort. See `system_design.html` for architecture and
scoring detail; `master_console.html` for the live 結案 console.*
