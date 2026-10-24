# HoldingsLens · Portfolio Risk Attribution

**[English](README.en.md) ｜ [中文](README.md)**

![tests](https://img.shields.io/badge/tests-126%2F126-brightgreen.svg)
![static checks](https://img.shields.io/badge/static%20checks-32%2F32-brightgreen.svg)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)
![platforms](https://img.shields.io/badge/platform-WeChat%20Mini%20Program%20%2F%20H5%20%2F%20Node-lightgrey.svg)
![license](https://img.shields.io/badge/license-MIT-blue.svg)

Break your portfolio's **risk sources** apart and show you the math — **no price prediction, only "where is your risk actually betting".**

> This is a risk-structure diagnostic tool for personal investment portfolios. Most investing tools compete on predicting prices; nobody computes where risk comes from. This tool fills that gap: enter holdings (amounts or fund codes) and get a "risk bill" in 30 seconds — how much each asset contributes in capital vs. how much risk it carries, how a crisis-time correlation spike hits the portfolio, and how many genuinely independent bets hide behind the nominal position count. All formulas are expandable, nothing is a black box. Three front ends — WeChat mini program, H5 web page, and local Node scripts — share one byte-identical UMD engine. Everything computes locally; holdings never leave your device.

> ⚠️ **Not investment advice.** This tool only measures risk structure. It does not predict prices and offers no buy/sell recommendations. Asset parameters (volatility, max drawdown, correlations) are long-run estimates on the order of academic literature, not live quotes. OTC (off-exchange) funds are approximated at the asset-class level. The correlation matrix is a static baseline; the crisis module only shifts it upward and cannot predict correlation regime changes. Past drawdowns do not indicate future results.

## Features

- **Risk contribution attribution**: side-by-side bars of capital weight vs. risk contribution for every holding; negative contributions (hedges) are explicitly labeled "absorbs volatility" instead of being treated as outliers.
- **Effective Number of Bets (ENB)**: `ENB = min(N_eff, 1/(wᵀCw))` — folds capital weights and correlation into one diversification metric, catching both "highly correlated holdings" and "extremely skewed weights" forms of pseudo-diversification.
- **Crisis stress test**: correlations may only rise, never fall (the `crisisRho` invariant), which structurally guarantees crisis volatility ≥ normal volatility; outputs crisis volatility and the diversification-decay ratio.
- **Structural health score**: six weighted dimensions (concentration 18% / mismatch 30% / diversification 15% / crisis resilience 12% / overlap 10% / absolute risk 15%). The mismatch dimension only penalizes "extra risk taken because of correlation" and is guarded by the property test "adding defensive assets must never lower the score" (84 controlled pairs + 2000 random portfolios, 0 violations).
- **Direct code input**: on-exchange ETF codes, 19 OTC feeder-fund codes, Taiwan codes with exchange suffixes, and fuzzy Chinese-name matching.
- **Optimization simulator**: only suggests rebalances when there is a material mismatch (mismatch × portfolio volatility > 2 percentage points), so low-volatility portfolios are not misled by noise.
- **Share card**: one-tap 1080×1440 risk-checkup long image, save and share.
- **Fully local**: zero npm dependencies, works offline, holdings never leave the device. Simplified/Traditional Chinese is produced at the engine layer (`analyze(holdings, {lang:'tw'|'cn'})`), not by swapping UI strings.

## Quick Start

Three ways to run — pick by scenario.

### 1. WeChat Mini Program

Import the `miniprogram/` directory in WeChat DevTools and choose "Tourist AppID" to preview (base library pinned at 3.5.5; the share card relies on `canvas type="2d"`, requiring 2.9.0+).

### 2. H5 Web Page

```
Open web/index.html directly in a browser      # no server, no build
Or double-click deliverables/持倉透鏡_H5演示_单文件.html   # engine inlined, works offline
Live demo: https://jerry19750106-code.github.io/holdingslens/
```

### 3. Local Scripts (Node 20+)

```bash
node tests/engine.test.js    # engine invariant tests (126)
node verify-mp.js            # mini program static self-check (17)
node verify-web.js           # H5 static self-check (15)
node build-web.js            # repack the H5 bundle
node build-standalone.js     # regenerate the H5 single-file build
```

Edit the holdings at the top of `tests/engine.test.js` to batch-analyze your own portfolio.

> **Note**: a mini program cannot require modules outside its project root, so the engine has a byte-identical copy (same md5) at `miniprogram/shared/`. After editing the engine, sync the copy and repack the H5 builds.

## Three Front Ends

| Front end | Path | Notes | Status |
|---|---|---|---|
| WeChat mini program | `miniprogram/` | Native WXML/WXSS/JS, 3 pages (home / report / about), `canvas type="2d"` share card, `wx.saveImageToPhotosAlbum`; zero npm dependencies | ✅ complete |
| H5 web page | `web/` | Multi-file build (index.html + engine.bundle.js): canvas share card, conic-gradient score ring, code input | ✅ complete |
| H5 single file | `deliverables/持倉透鏡_H5演示_单文件.html` | Engine inlined, double-click offline; the GitHub Pages live site is this file | ✅ complete |
| Local scripts | `tests/` | Node batch analysis / backtest / invariant tests | ✅ complete |
| Shared engine | `shared/assetlib.js`, `shared/engine.js` | 17 asset classes + 136 correlations + alias resolution; UMD engine, one codebase for all three ends | ✅ complete |

## Directory Structure

| Path | Contents |
|---|---|
| `shared/assetlib.js` | 17 asset classes (volatility / max drawdown / type / region) + 136 upper-triangular correlations + alias resolution (on-exchange codes, 19 OTC feeder codes, Taiwan suffix spellings, fuzzy Chinese names) |
| `shared/engine.js` | UMD engine: covariance matrix, marginal risk, risk contribution, ENB, crisis correlation, health score, optimization simulator, bilingual findings |
| `miniprogram/` | Mini program source: app trio, `pages/` (index, report, about), `shared/` (engine copy), `utils/` (i18n, local store) |
| `web/` | H5 multi-file build (index.html + engine.bundle.js) |
| `tests/engine.test.js` | 126 engine invariant tests |
| `build-web.js`, `build-standalone.js` | Pack the H5 bundle / single-file build |
| `verify-web.js`, `verify-mp.js` | H5 / mini program static self-checks |
| `deliverables/` | Submission docs, asset parameter table, pitch deck, H5 single-file build, verification screenshots |

## Demo Case (real engine output, not fabricated)

Input: A-share growth ¥180k + US tech ¥150k + gold ¥60k + China bonds ¥40k (total ¥430k)

| Asset | Capital weight | Risk contribution | Reading |
|---|---|---|---|
| A-share growth | 41.9% | **60.2%** | 18.3 pp overweight; risk highly concentrated |
| US tech | 34.9% | 37.4% | Slightly overweight, highly correlated with A-share growth |
| Gold | 14.0% | 2.5% | Quality diversification, low risk at high value |
| China bonds | 9.3% | **−0.2%** | Negative contribution = hedge, absorbs portfolio volatility |

- Portfolio volatility: normal **17.2%** → crisis **19.5%** (+13.4%)
- Diversification decay: **41.5%**
- Effective holdings nEff **3.1** ｜ ENB **2.3** (4 nominal positions; only 2.3 genuinely independent bets after correlation)
- Structural health score: **62 / 100 (basically sound, with lopsidedness)**
- Rebalance simulation (the only suggestion that passes the materiality threshold): move 20% of A-share growth into China bonds → volatility 17.2% → 15.1%, largest single risk share 60% → 52%

**Control group (same engine, real runs)**:

| Portfolio | Volatility | nEff | ENB | Health | Verdict | Bet flag |
|---|---|---|---|---|---|---|
| **Demo** (growth 180k / US tech 150k / gold 60k / bonds 40k) | 17.2% | 3.1 | **2.3** | **62** | Basically sound, lopsided | Pseudo-diversified |
| Conservative (bonds 40 / dividend 25 / gold 15 / cash 20) | 5.2% | 3.5 | 3.1 | **78** | Basically sound, lopsided | — |
| Balanced (A broad 25 / US 25 / CN bonds 25 / gold 15 / HK 10) | 9.7% | 4.5 | 3.1 | **77** | Basically sound, lopsided | Concentrated |
| 60/40 (A broad 60 / CN bonds 40) | 12.0% | 1.9 | 1.9 | 56 | Structurally fragile | — |
| Cross-border dual growth (A growth 50 / US tech 50) | 21.8% | 2.0 | 1.4 | 58 | Structurally fragile | Pseudo-diversified |
| All-in China+HK, 5 classes equal weight | 20.3% | 5.0 | **1.2** | 56 | Structurally fragile | Pseudo-diversified |
| Single-region A-share (growth 50 / small 50) | 25.6% | 2.0 | 1.1 | 49 | Structurally fragile | Pseudo-diversified |
| 100% A-share broad | 20.0% | 1.0 | 1.0 | 51 | Structurally fragile | — |
| 99.9% crypto + 3 scraps | 59.9% | 1.0 | 1.0 | 40 | Structurally fragile | Pseudo-diversified |

Compare columns 3 and 4: 5 nominal positions with nEff 5.0 "look diversified", yet ENB is only 1.2 — that is the mathematical portrait of pseudo-diversification. ENB is also weight-sensitive: 99.9% in crypto plus three scraps still yields ENB 1.0. The health score's direction is property-tested: adding bonds or cash only adds points, never subtracts.

## Decision Log

This project went through four rounds of external review (Claude ×2, Gemini ×2, including independent Python cross-validation) and one round of hands-on user verification. Below are the final decisions that shaped the deliverable — recorded here for reviewers and contributors:

| # | Topic | Final decision | Rationale & evidence |
|---|---|---|---|
| 1 | ENB formula | Adopt `ENB = min(N_eff, 1/(wᵀCw))` | The old version ignored capital weights: 99.9% in crypto + three 0.03% scraps scored ENB 3.9 ("no concentration risk"). The new formula counts both weights and correlation; 11 scenarios independently verified in Python, all matching. Capped at N_eff so hedging portfolios cannot exceed their position count. |
| 2 | Fixed ENB thresholds 1.8 / 2.8 | **Rejected**; keep the position-count-scaled pseudo-diversification test | Fixed thresholds misflag "bonds 70 / cash 30" (ENB 1.61) as pseudo-diversified while missing "10 positions, 3 bets" |
| 3 | Health-score mismatch baseline | Change from "risk share − capital share" to "risk share − independent volatility share" (wᵢσᵢ/Σwⱼσⱼ) | User-verified hard defect: under the old baseline "adding bonds lowers the score" — 100% growth scored 48, a 50/50 stock-bond mix dropped to 32; 117 of 126 control pairs regressed. The new baseline only penalizes extra risk taken because of correlation; 0 violations across 84 controlled pairs + 2000 random portfolios after the fix |
| 4 | Crisis correlation | `crisisRho` keeps original correlation for cash (return base) | Guarantees σ_crisis ≥ σ_normal structurally, not by tuning; measured all-cash 0.5%→0.5%, bonds+cash 3.6%→3.6%, guarded by 5000 random portfolios |
| 5 | "Meucci definition" / "eigenvalue" wording | Removed | The ENB formula changed; citing stale definitions would mislead reviewers |
| 6 | H5 publishing | GitHub Pages | Zero server cost; reviewers open a link and try it |
| 7 | Mini program submission | **No review submission; source code only** | WeChat's finance category requires qualifications; this work is positioned as a competition / portfolio demo, not a commercial release |
| 8 | Adding 5 more OTC fund codes | Not added | No control-group validation; violates the project's dual-track verification discipline |
| 9 | 100%-cash verdict wording | Optional, not done | Copy polish only, no impact on mathematical correctness; hard-defect fixes took priority |

## Tests

```bash
node tests/engine.test.js   # engine invariant tests        → 126/126 pass
node verify-web.js          # H5 static self-check          → 15/15 pass
node verify-mp.js           # mini program static self-check → 17/17 pass
```

Tests are not decoration. Issues found and fixed during development include: crisis correlation failing for cash (σ_crisis < σ_normal), health-score "risk inversion" (conservative portfolios scoring below all-stock ones), "adding bonds lowers the score", nEff semantic drift (equal-weight highly correlated portfolios scoring full marks), unrecognized OTC codes, and conservative portfolios receiving false rebalance advice. Every fix has a regression test, and the composite score additionally passes the "adding defensive assets must not lower the score" monotonicity test.

## Documents

| File | Contents |
|---|---|
| `deliverables/作品說明.md` | Full submission write-up (positioning / features / math / verification / limits) |
| `deliverables/資產風險參數表.xlsx` | 17 asset-class parameters + 136-cell correlation matrix + OTC code mapping (dumped from engine code, not hand-copied) |
| `deliverables/持倉透鏡_投稿簡報.pptx` | 9-page pitch deck (case numbers produced by real engine runs) |
| `deliverables/XRay_投稿簡報/STORY.md` | Deck narrative structure and page outline |
| `deliverables/XRay_投稿簡報/inspect.md` | Page-by-page visual lint report (9 pages) |
| `deliverables/shots/` | Verification screenshots of both front ends |
| `LICENSE` | Full MIT license text |

## Development Discipline

- **Dual-track verification**: static (grep / AST / JSON parsing) + behavioral (import real code, never mock the path); prove a test fails first, then fix until it passes.
- **Every number carries same-round evidence**: amounts and statistics are always computed by code — no mental math, no second-hand claims; test conclusions come from actual run output.
- **When fixing a bug, first list all issues of the same kind, then fix them one by one** — none left behind.
- **Composite scores must pass property tests**: passing all cases does not mean the direction is right — the monotonicity guard "adding bonds/cash must never lower the health score" is exactly what caught the "adding bonds lowers the score" hard defect.

## License & Contact

Licensed under MIT: free to use, modify, and redistribute (including commercial use), provided the copyright and license notice are preserved; the author provides no warranty and assumes no liability for any loss arising from use of this project.

- Author: Jerry Hsiao (蕭永滐)
- Email: jerry19750106@gmail.com
- GitHub: [@jerry19750106-code](https://github.com/jerry19750106-code)
- Live demo: https://jerry19750106-code.github.io/holdingslens/

---

## MIT License

Copyright (c) 2026 Jerry Hsiao

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
