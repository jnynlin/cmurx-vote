# Poster Judge Tool — Test Checklist

Live: https://jnynlin.github.io/cmurx-vote/poster_judge.html

## Automated (run before each release)
```bash
node stress_test_judge.js          # backend logic — expect 23/23 passed
grep -c '\bconst \|\blet \|=>\|`' gas_sync.gs   # GAS Rhino safety — expect 0
```
Full GAS end-to-end (writes to real sheet + sends email): in the Apps Script
editor run `runE2ETest3Judges()`, then `cleanupTestData()` to reset.

## Manual — frontend (browser)

### Login
- [ ] Label shows「# 僅數字」tag
- [ ] Typing Chinese into PIN → box shakes red + error sound + toast「僅限數字」; digit keys work
- [ ] Full-width digits ２３４５ accepted (NFKC)
- [ ] Name + 4-digit PIN → calligraphy signature preview (skewed, no honorific)
- [ ] Submit → loading → scoring page, toast「歡迎，○○老師」

### Scoring
- [ ] Three banners: green Padlet-comment nudge / blue scoring-model note / amber rubric (1待加強…5優異)
- [ ] 12 cards: element colour stripe + group number 1-12 + wide gap
- [ ] 整體印象 row visually separated (divider + 綜合 tag)
- [ ] Click star → bottom-right「✓ 已儲存」; click same star again → resets to 0
- [ ] Card top-right shows weighted score (1-5)
- [ ] Progress bar + percentage update
- [ ] 「未完成」button → scrolls + flashes first unscored card
- [ ] Gallery link tapped repeatedly → reuses ONE tab

### Submit
- [ ] Must score all 12 before submit → summary modal (with weighted col) → confirm → confetti
- [ ] Result screen: signature box + result table (整體印象 + 加權) + copy/print buttons
- [ ] If email given → confirmation email arrives (subject「藥學系 Pathophysiology」+ Padlet comment reminder)

### Return / revise
- [ ] Reopen page → PIN-only screen (name remembered)
- [ ] Wrong PIN → rejected; correct PIN → previously submitted scores restored
- [ ] Change a score → tri-colour stars (green added / red removed) + 「已修改 X 項」badge + colour legend

### Backend (Google Sheet "海報評審")
- [ ] V1 cell shows「已送出 N / 3 位評審」
- [ ] Averages ignore unsubmitted judges (correct mid-event)
- [ ] 最終總分 = 50% dim-avg + 50% 整體印象; 排名 correct
