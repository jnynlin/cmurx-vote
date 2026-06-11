---
name: gas-scoring-webapp
description: Use when building or extending a single-file Vue3 + Google Apps Script + GitHub Pages tool for scoring / voting / surveying / judging (e.g. poster review, rubric grading, ballot collection) where data lands in a Google Sheet and optionally triggers email. Also use when extending the cmurx poster judge tool. Captures the architecture, the build/test/deploy loop, and the hard-won gotchas (GAS Rhino runtime, PIN/IME input, CSS specificity, mobile, score persistence, partial-submission averaging).
version: 1.0.0
---

# GAS-backed single-file scoring web tool

A pattern for lightweight data-collection web apps: **one self-contained `*.html`** (Vue 3 via CDN, no build step) on **GitHub Pages**, posting JSON to a **Google Apps Script webhook** that writes a **Google Sheet** and optionally sends **email** (MailApp). No server, no Firebase, no auth provider.

Reference implementation in this repo: `poster_judge.html` + `gas_sync.gs` + `stress_test_judge.js` + `gas_test_suite.gs` + `TEST_CHECKLIST.md` (live at jnynlin.github.io/cmurx-vote/poster_judge.html).

## Architecture

```
user browser ──POST JSON──▶ GAS doPost(e) ──▶ Google Sheet (+ MailApp email)
 (GitHub Pages,                shared-secret check          ▲
  single HTML,                 action router                │
  Vue3 CDN)            loginX / submitX / readBack ─────────┘
```

- `doPost(e)` parses `JSON.parse(e.postData.contents)`, rejects unless `data.secret === SECRET`, routes on `data.action`.
- Wrap the whole handler in `LockService.getScriptLock()` (tryLock 10s) for concurrency.
- Return `ContentService.createTextOutput(JSON.stringify({status,...})).setMimeType(JSON)`.
- The HTML `fetch(GAS_URL, {method:'POST', body: JSON.stringify({action, secret, ...})})`.

## Build / test / deploy loop

1. Edit HTML + `.gs` in the repo working copy.
2. **Test logic** without touching real services: port the GAS handler logic into a Node file with a mock sheet (`sheet.get(r,c)/set(r,c,v)`) and assert edge cases. Keep it green (e.g. `node stress_test_judge.js` → 23/23).
3. **Verify Rhino safety** (see gotcha 1): `grep -c '\bconst \|\blet \|=>\|\`' file.gs` must be **0**.
4. **Verify Vue bindings**: every identifier used in the template must be in the `setup()` return — grep-diff template ids vs the return block to catch "X is not defined" before manual testing.
5. Commit + `git push` **manually** (auto-mode blocks pushing the GAS secret to a public repo).
6. HTML auto-deploys via GitHub Pages (~1 min). 
7. **GAS deploy is manual**: paste the full `.gs` into the Apps Script editor → Save → Deploy → Manage deployments → Edit → New version (URL unchanged). Real E2E: run a `runE2ETest()` function inside the editor (hits handlers directly, no browser), then a `cleanup()` function to reset test rows.
8. Maintain a `TEST_CHECKLIST.md` (automated + manual full-flow).

## Critical gotchas (each cost real debugging time)

1. **GAS Rhino runtime kills the whole script on one ES6 global.** A single global `const`/`let` array/object causes a parse error that makes EVERY function fail — the auth dialog never even appears; the only error is the useless "An unknown error has occurred." Use `var` everywhere, `function(){}` not arrows, string concat not template literals. Diagnose: a trivial `function ping(){Logger.log('ok')}` in a SEPARATE file runs but main-file functions all fail → parse error in main file.

2. **Sheet averages must ignore not-yet-submitted contributors.** Scores are 1–N; a blank/absent contributor reads as 0 and `AVERAGE(C,G,K)` drags results down → wrong rankings mid-event. Use `(C+G+K)/((C>0)+(G>0)+(K>0))`.

3. **Read-back for revise.** If you clear local state on submit, a returning user sees blanks. The Sheet is authoritative — have the login handler return the user's stored values (`readBack_()`) and repopulate; localStorage is only a same-device draft.

4. **PIN / numeric input + IME.** 4 separate `type="tel"` boxes (NOT `maxlength` — it dismisses the mobile keyboard mid-entry; use an `@input` sanitiser). `.normalize('NFKC')` to convert full-width digits ２３４５ from Chinese IME before `replace(/\D/g,'')`. Make digit-only VISIBLE: a「僅數字」tag + shake-red + toast on non-digit (Linux fcitx/ibus users otherwise can't tell it's working). Never use the PIN as a localStorage key (DevTools leak) — key on an internal slot id.

5. **CSS specificity/order.** A new state class equal in specificity to a base class only wins if defined LATER in the file, or bumped higher (`.star.active.s-added` beats `.star.active`). Symptom: "new colour doesn't show."

6. **Popups / external links on mobile.** Named `target="myGallery"` (reuses one tab on repeat taps, not tab-spam) + `rel="noopener noreferrer"`. Mobile can't open a true separate OS window. Pre-open before any `await` if opening after async.

7. **Score persistence across backgrounding.** Save to localStorage on every interaction + a session record; restore on load. Mobile kills backgrounded tabs.

## Identity without an auth provider

- **Auto-slot by arrival order**: first N users to log in claim slots (A/B/C…) stored in the Sheet; the user never sees the slot. Same name+PIN returns the same slot; wrong PIN rejected; all slots full → friendly error.
- **Self-set PIN** (4 digits) for return/revise. name+PIN = identity. Show「歡迎回來」on return.
- Shared secret in the payload gates all writes server-side.

## Scoring-model clarity (when grading)

- If one field decides ranking, name it for what it is (e.g. 整體印象 holistic 1–5, NOT 整體總分 which implies a sum). 
- Publish a **rubric/anchor** (1=poor … 5=excellent) so independent judges calibrate the same scale.
- Show a **weighting note** + each item's effective weighted score live.
- For qualitative feedback, prefer nudging users to an existing comment surface (e.g. Padlet) over building+storing free text.

## UX polish that mattered

Pre-submit summary modal · scroll-to-incomplete + flash · offline detection (block submit) · confetti on success · copy-to-clipboard + print result · audio+haptic input feedback · auto-save indicator · change-tracking on revise (old→new, tri-colour) · anti-mis-fill on multi-column grids (per-item colour accent + number badge + wide gap + focus-within glow).
