# 持倉透鏡 HoldingsLens · 設計稿 DESIGN

## 畫布與母版（三區）
- 畫布 1280×720；安全區 padding 上下 20 / 左右 64。
- A 標題塊 0–120px：主標題 34px bold；B 內容區 120–660px；C 頁腳條 660–720px：左「X-Ray 資產風險透視 · 1024 投稿」右「NN / 09」。
- 封面/結束頁自定義版式，省略 C 區。

## 色彩池（≤4 hex，深色科技財經）
- 背景主色 `#0A1628`（深海藍）
- 主色 / 焦點 `#0099FF`（亮藍）
- 輔色 `#00E2C6`（青）
- 文本主色 `#E6F0FA`（淺藍白）
- 面積分配：主色(背景+大色塊) ≤60%；輔色(卡片底/第二系列/分隔) ≤30%；強調色(#0099FF 高亮) 支撐頁 ≤5%、Hero ≤18%。

## 字體
- 標題/錨點數字：`"PingFang SC","Microsoft YaHei","Source Han Sans SC",sans-serif` bold。
- 正文：`"PingFang SC","Microsoft YaHei",sans-serif` regular。
- 巨型數字強制 ≥72px bold，與正文明顯字重/字級差異。

## 字號階梯
- 封面主標 68px / 章節大字 56px / 巨型錨點 72–96px / 頁標題 34px / 卡片小標 22px / 正文 20px / 頁腳 14px。

## 漸變與半透明
- 標題欄與卡片頭：`linear-gradient(135deg,#0099FF 0%,#00E2C6 100%)`。
- 大面積淺色覆蓋：`rgba(0,153,255,0.08)`。
- 卡片浮起：`boxShadow:0 4px 20px rgba(0,0,0,0.35)`。

## 配圖（全 SVG，抽象幾何/圖表底圖，不免 ImageGen）
- L1 主視覺：封面同心風險環、第 6 頁架構圖、第 7 頁風險貢獻條，皆 SVG。
- L3 角標：全篇右下頁碼，位置一致。

## 頁面映射表
| # | 文件 | 類型 | 角色 | 版式 | 字數 | 留白% | 色彩分配 |
| - | - | - | - | - | - | - | - |
| 01 | 01.slide | cover | hero | 全屏視覺+大標題 | 40 | 35% | 主色60%+強調18% |
| 02 | 02.slide | content | supporting | 非對稱雙欄 | 200 | 25% | 主色50%+輔色20% |
| 03 | 03.slide | content | supporting | 左標題+右內容 | 220 | 28% | 主色50%+輔色20% |
| 04 | 04.slide | content | supporting | 巨型數字+洞察 | 180 | 30% | 主色55%+強調10% |
| 05 | 05.slide | content | supporting | N卡片橫排 | 300 | 22% | 主色45%+輔色25% |
| 06 | 06.slide | content | supporting | 左大圖+右側文字 | 220 | 26% | 主色50%+輔色20% |
| 07 | 07.slide | content | hero | 巨型數字+洞察 | 160 | 35% | 主色55%+強調18% |
| 08 | 08.slide | content | supporting | 非對稱雙欄 | 200 | 25% | 主色50%+輔色20% |
| 09 | 09.slide | ending | hero | 居中金句 | 60 | 40% | 主色60%+強調15% |
