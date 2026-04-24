# 趨勢回放 Trend Replay

純前端歷史股價回放遊戲。隨機選股、隨機開局日期，用 100 個交易日決勝負。

## 玩法

- 開局隨機挑一檔台股、隨機落在某個歷史日期
- 按 **下一步** (Space) 推進一天，按 **買進** (B) / **賣出** (S) 交易
- 100 回合結束後結算，與「買入持有」做對照
- 手續費 0.1425%，賣出證交稅 0.3%

## 資料

- 50 檔台股，2024-04 ~ 2026-04 日 K，來源：自建 DB
- 股票涵蓋：台積電、聯發、光寶科、群聯、大立光、台達電、中華電、國巨、研華、譜瑞-KY、…
- 資料檔位於 `data/prices/*.json`，總量 ~1.3 MB

## 本機啟動

```bash
python3 -m http.server 8080
# 開 http://localhost:8080
```

## 部署 GitHub Pages

1. push 到 GitHub
2. Settings → Pages → Source 選 `main` branch / root
3. 等一分鐘打開 `https://<user>.github.io/<repo>/`

## 重新產資料

```bash
python3 build_data.py
```

需要 `../Investor-Calendar/db/price_history.db` 存在。

## 技術棧

- 圖表：[lightweight-charts](https://github.com/tradingview/lightweight-charts) (CDN)
- 純 HTML/CSS/JS，無 build step
- MA5 / MA20 / MA60 疊加
