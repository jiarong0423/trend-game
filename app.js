const INITIAL_CASH = 1_000_000;
const TOTAL_ROUNDS = 100;
const PRE_BARS = 60; // MA60 最少需求，讓短歷史股也能從中間開局
const FEE_RATE = 0.001425;
const TAX_RATE = 0.003;

const state = {
  stocks: [],
  stock: null,
  prices: [],
  startIdx: 0,
  cursor: 0,
  cash: INITIAL_CASH,
  pos: 0,
  avg: 0,
  realized: 0,
  log: [],
  trades: 0,
  over: false,
};

let chart, candleSeries, volumeSeries, ma5Line, ma20Line, ma60Line, bbUpper, bbLower;

async function loadCatalog() {
  const r = await fetch("data/stocks.json");
  state.stocks = await r.json();
}

async function loadPrices(id) {
  const r = await fetch(`data/prices/${id}.json`);
  return await r.json();
}

function ma(arr, n, key = "c") {
  const out = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i][key];
    if (i >= n) sum -= arr[i - n][key];
    if (i >= n - 1) out.push({ time: arr[i].t, value: +(sum / n).toFixed(2) });
  }
  return out;
}

function bollinger(arr, n = 20, k = 2) {
  const up = [], lo = [];
  for (let i = n - 1; i < arr.length; i++) {
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += arr[j].c;
    const m = sum / n;
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) sq += (arr[j].c - m) ** 2;
    const sd = Math.sqrt(sq / n);
    up.push({ time: arr[i].t, value: +(m + k * sd).toFixed(2) });
    lo.push({ time: arr[i].t, value: +(m - k * sd).toFixed(2) });
  }
  return { up, lo };
}

function toCandle(p) {
  return { time: p.t, open: p.o, high: p.h, low: p.l, close: p.c };
}
function toVol(p) {
  const up = p.c >= p.o;
  return {
    time: p.t,
    value: p.v,
    color: up ? "rgba(63,185,80,0.5)" : "rgba(224,82,82,0.5)",
  };
}

function setupChart() {
  const el = document.getElementById("chart");
  el.innerHTML = "";
  chart = LightweightCharts.createChart(el, {
    layout: { background: { color: "#0e1116" }, textColor: "#e6edf3" },
    grid: {
      vertLines: { color: "#1c222b" },
      horzLines: { color: "#1c222b" },
    },
    crosshair: { mode: 0 },
    rightPriceScale: { borderColor: "#2a313c" },
    timeScale: { borderColor: "#2a313c", rightOffset: 5 },
  });
  candleSeries = chart.addCandlestickSeries({
    upColor: "#e05252",
    downColor: "#3fb950",
    borderUpColor: "#e05252",
    borderDownColor: "#3fb950",
    wickUpColor: "#e05252",
    wickDownColor: "#3fb950",
  });
  volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "vol",
    scaleMargins: { top: 0.8, bottom: 0 },
  });
  chart.priceScale("vol").applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });
  ma5Line = chart.addLineSeries({ color: "#5a9cf8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  ma20Line = chart.addLineSeries({ color: "#f0b75c", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  ma60Line = chart.addLineSeries({ color: "#b37cf0", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  bbUpper = chart.addLineSeries({ color: "rgba(180,180,180,0.5)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
  bbLower = chart.addLineSeries({ color: "rgba(180,180,180,0.5)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });

  window.addEventListener("resize", () => chart.applyOptions({}));
}

function renderChart() {
  const slice = state.prices.slice(0, state.cursor + 1);
  candleSeries.setData(slice.map(toCandle));
  volumeSeries.setData(slice.map(toVol));
  ma5Line.setData(ma(slice, 5));
  ma20Line.setData(ma(slice, 20));
  ma60Line.setData(ma(slice, 60));
  const bb = bollinger(slice, 20, 2);
  bbUpper.setData(bb.up);
  bbLower.setData(bb.lo);
  chart.timeScale().fitContent();
}

function appendBar() {
  const p = state.prices[state.cursor];
  candleSeries.update(toCandle(p));
  volumeSeries.update(toVol(p));
  // refresh MAs + BB (cheap for our sizes)
  const slice = state.prices.slice(0, state.cursor + 1);
  ma5Line.setData(ma(slice, 5));
  ma20Line.setData(ma(slice, 20));
  ma60Line.setData(ma(slice, 60));
  const bb = bollinger(slice, 20, 2);
  bbUpper.setData(bb.up);
  bbLower.setData(bb.lo);
}

function nowPrice() {
  return state.prices[state.cursor].c;
}
function nowDate() {
  return state.prices[state.cursor].t;
}

function fmt(n, d = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function updatePanel() {
  const price = nowPrice();
  document.getElementById("stockLabel").textContent = "??? ???";
  document.getElementById("dateLabel").textContent = "????-??-??";
  document.getElementById("roundsLeft").textContent =
    TOTAL_ROUNDS - state.trades > 0
      ? TOTAL_ROUNDS - (state.cursor - state.startIdx)
      : 0;
  document.getElementById("priceNow").textContent = fmt(price, 2);
  const posEl = document.getElementById("pos");
  if (state.pos > 0) {
    posEl.textContent = `多 ${fmt(state.pos)}`;
    posEl.className = "pos-pnl";
  } else if (state.pos < 0) {
    posEl.textContent = `空 ${fmt(-state.pos)}`;
    posEl.className = "neg-pnl";
  } else {
    posEl.textContent = "—";
    posEl.className = "";
  }
  document.getElementById("avg").textContent =
    state.pos !== 0 ? fmt(state.avg, 2) : "—";
  const unreal =
    state.pos > 0
      ? (price - state.avg) * state.pos
      : state.pos < 0
      ? (state.avg - price) * -state.pos
      : 0;
  const unrealEl = document.getElementById("unreal");
  unrealEl.textContent = fmt(unreal, 0);
  unrealEl.className = unreal > 0 ? "pos-pnl" : unreal < 0 ? "neg-pnl" : "";

  document.getElementById("cash").textContent = fmt(state.cash, 0);
  const equity = state.cash + state.pos * price;
  document.getElementById("equity").textContent = fmt(equity, 0);
  const realEl = document.getElementById("realized");
  realEl.textContent = fmt(state.realized, 0);
  realEl.className = state.realized > 0 ? "pos-pnl" : state.realized < 0 ? "neg-pnl" : "";
  const roi = ((equity - INITIAL_CASH) / INITIAL_CASH) * 100;
  const roiEl = document.getElementById("roi");
  roiEl.textContent = `${roi >= 0 ? "+" : ""}${roi.toFixed(2)}%`;
  roiEl.className = roi > 0 ? "pos-pnl" : roi < 0 ? "neg-pnl" : "";

  renderLog();
}

function renderLog() {
  const ul = document.getElementById("log");
  ul.innerHTML = "";
  for (const l of state.log.slice().reverse().slice(0, 50)) {
    const li = document.createElement("li");
    li.className = l.side;
    li.textContent = `${l.t} ${l.side === "buy" ? "買" : "賣"} ${fmt(l.qty)}@${l.p.toFixed(2)}  ${l.pnl !== undefined ? `損益 ${fmt(l.pnl, 0)}` : ""}`;
    ul.appendChild(li);
  }
}

function buy() {
  if (state.over) return;
  let qty = +document.getElementById("qty").value;
  if (qty <= 0) return;
  const price = nowPrice();
  let totalPnl = 0;
  let coveredProfit = null;

  // Phase 1: cover existing short
  if (state.pos < 0) {
    const qtyCover = Math.min(qty, -state.pos);
    const gross = price * qtyCover;
    const fee = Math.max(20, Math.floor(gross * FEE_RATE));
    if (state.cash < gross + fee) {
      alert("現金不足");
      window.SFX && SFX.error();
      return;
    }
    const pnl = (state.avg - price) * qtyCover - fee;
    state.cash -= gross + fee;
    state.pos += qtyCover;
    state.realized += pnl;
    totalPnl += pnl;
    coveredProfit = pnl >= 0;
    qty -= qtyCover;
    if (state.pos === 0) state.avg = 0;
  }

  // Phase 2: open/add long
  if (qty > 0) {
    const gross = price * qty;
    const fee = Math.max(20, Math.floor(gross * FEE_RATE));
    if (state.cash < gross + fee) {
      alert(state.pos > 0 ? "現金不足加碼" : "現金不足");
      window.SFX && SFX.error();
      if (coveredProfit === null) return;
    } else {
      const prevPos = Math.max(state.pos, 0);
      state.avg = (state.avg * prevPos + gross) / (prevPos + qty);
      state.pos += qty;
      state.cash -= gross + fee;
    }
  }

  state.trades++;
  state.log.push({
    t: nowDate(), side: "buy",
    qty: +document.getElementById("qty").value,
    p: price, pnl: totalPnl || undefined,
  });
  window.SFX && (coveredProfit !== null ? SFX.sell(coveredProfit) : SFX.buy());
  updatePanel();
  checkEnd();
}

function sell() {
  if (state.over) return;
  let qty = +document.getElementById("qty").value;
  if (qty <= 0) return;
  const price = nowPrice();
  let totalPnl = 0;
  let closedProfit = null;

  // Phase 1: close existing long
  if (state.pos > 0) {
    const qtyClose = Math.min(qty, state.pos);
    const gross = price * qtyClose;
    const fee = Math.max(20, Math.floor(gross * FEE_RATE));
    const tax = Math.floor(gross * TAX_RATE);
    const pnl = (price - state.avg) * qtyClose - fee - tax;
    state.cash += gross - fee - tax;
    state.pos -= qtyClose;
    state.realized += pnl;
    totalPnl += pnl;
    closedProfit = pnl >= 0;
    qty -= qtyClose;
    if (state.pos === 0) state.avg = 0;
  }

  // Phase 2: open/add short (gets proceeds, acts as collateral)
  if (qty > 0) {
    const gross = price * qty;
    const fee = Math.max(20, Math.floor(gross * FEE_RATE));
    const tax = Math.floor(gross * TAX_RATE);
    // soft margin check: total short exposure <= current equity × 2
    const newShortAbs = -state.pos + qty;
    const equity = state.cash + state.pos * price;
    if (newShortAbs * price > equity * 2) {
      alert("保證金不足 (空單最多 2 倍槓桿)");
      window.SFX && SFX.error();
      if (closedProfit === null) return;
    } else {
      const prevShort = Math.max(-state.pos, 0);
      state.avg = (state.avg * prevShort + gross) / (prevShort + qty);
      state.pos -= qty;
      state.cash += gross - fee - tax;
    }
  }

  state.trades++;
  state.log.push({
    t: nowDate(), side: "sell",
    qty: +document.getElementById("qty").value,
    p: price, pnl: totalPnl || undefined,
  });
  window.SFX && (closedProfit !== null ? SFX.sell(closedProfit) : SFX.buy());
  updatePanel();
  checkEnd();
}

function nextDay() {
  if (state.over) return;
  if (state.cursor >= state.prices.length - 1) {
    finish();
    return;
  }
  state.cursor++;
  appendBar();
  updatePanel();
  window.SFX && SFX.tick();
  if (state.cursor - state.startIdx >= TOTAL_ROUNDS) {
    finish();
  }
}

function checkEnd() {
  if (state.cursor - state.startIdx >= TOTAL_ROUNDS) finish();
}

function finish() {
  if (state.over) return;
  state.over = true;
  const price = nowPrice();
  const equity = state.cash + state.pos * price;
  const roi = ((equity - INITIAL_CASH) / INITIAL_CASH) * 100;
  const startPrice = state.prices[state.startIdx].c;
  const bench = ((price - startPrice) / startPrice) * 100;
  const alpha = roi - bench;

  saveResult({
    date: new Date().toISOString(),
    stock: `${state.stock.id} ${state.stock.name}`,
    from: state.prices[state.startIdx].t,
    to: nowDate(),
    equity: Math.round(equity),
    roi: +roi.toFixed(2),
    bench: +bench.toFixed(2),
  });

  showResult({ equity, roi, bench, alpha });
}

function showResult({ equity, roi, bench, alpha }) {
  const set = (id, text, cls) => {
    const el = document.getElementById(id);
    el.textContent = text;
    if (cls !== undefined) {
      el.classList.remove("good", "bad");
      if (cls) el.classList.add(cls);
    }
  };

  const sign = (n) => (n >= 0 ? "+" : "");
  const cls = (n) => (n > 0 ? "good" : n < 0 ? "bad" : null);

  document.getElementById("revealStock").textContent =
    `${state.stock.id} · ${state.stock.name}`;
  document.getElementById("revealRange").textContent =
    `${state.prices[state.startIdx].t}  →  ${nowDate()}`;

  set("rsEquity", fmt(equity, 0));
  set("rsRoi", `${sign(roi)}${roi.toFixed(2)}%`, cls(roi));
  set("rsBench", `${sign(bench)}${bench.toFixed(2)}%`, cls(bench));
  set("rsAlpha", `${sign(alpha)}${alpha.toFixed(2)}%`, cls(alpha));
  set("rsTrades", state.trades);

  const v = document.getElementById("resultVerdict");
  v.classList.remove("win", "lose");
  if (alpha > 0) {
    v.textContent = "✦ 你擊敗了市場 ✦";
    v.classList.add("win");
  } else if (alpha < 0) {
    v.textContent = "× 輸給買進持有 ×";
    v.classList.add("lose");
  } else {
    v.textContent = "━ 與市場打平 ━";
  }

  document.getElementById("game-screen").classList.add("hidden");
  document.getElementById("result-screen").classList.remove("hidden");
  window.SFX && (alpha > 0 ? SFX.win() : SFX.lose());
}

function endGameEarly() {
  if (state.over) return;
  if (!confirm("確定要提早結束本局?")) return;
  finish();
}

// ================= Player / localStorage =================
const LS_NICK = "trendgame_nick";
const LS_HIST = "trendgame_history";

function getNick() { return localStorage.getItem(LS_NICK) || ""; }
function setNick(n) { localStorage.setItem(LS_NICK, n); }
function clearNick() { localStorage.removeItem(LS_NICK); }

function getHistory(nick) {
  const all = JSON.parse(localStorage.getItem(LS_HIST) || "{}");
  return all[nick] || [];
}
function saveResult(r) {
  const nick = getNick();
  if (!nick) return;
  const all = JSON.parse(localStorage.getItem(LS_HIST) || "{}");
  if (!all[nick]) all[nick] = [];
  all[nick].push(r);
  if (all[nick].length > 200) all[nick] = all[nick].slice(-200);
  localStorage.setItem(LS_HIST, JSON.stringify(all));
}

function calcStats(hist) {
  if (!hist.length) return { games: 0, best: null, avg: null, win: null };
  const rois = hist.map((h) => h.roi);
  const best = Math.max(...rois);
  const avg = rois.reduce((a, b) => a + b, 0) / rois.length;
  const wins = hist.filter((h) => h.roi > h.bench).length;
  return {
    games: hist.length,
    best,
    avg,
    win: (wins / hist.length) * 100,
  };
}

function renderLogin() {
  const nick = getNick();
  const retBox = document.getElementById("returning-box");
  const newBox = document.getElementById("newuser-box");
  if (nick) {
    retBox.classList.remove("hidden");
    newBox.classList.add("hidden");
    document.getElementById("welcomeName").textContent = nick;
    const s = calcStats(getHistory(nick));
    document.getElementById("statGames").textContent = s.games;
    document.getElementById("statBest").textContent =
      s.best === null ? "—" : `${s.best >= 0 ? "+" : ""}${s.best.toFixed(1)}%`;
    document.getElementById("statAvg").textContent =
      s.avg === null ? "—" : `${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(1)}%`;
    document.getElementById("statWin").textContent =
      s.win === null ? "—" : `${s.win.toFixed(0)}%`;
  } else {
    retBox.classList.add("hidden");
    newBox.classList.remove("hidden");
    document.getElementById("nickInput").value = "";
    setTimeout(() => document.getElementById("nickInput").focus(), 50);
  }
}

async function enterGame() {
  window.SFX && SFX.login();
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("result-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  document.getElementById("whoLabel").textContent = getNick();
  syncMuteBtn();
  if (!chart) {
    setupChart();
    await loadCatalog();
  }
  await newGame();
}

function syncMuteBtn() {
  const btn = document.getElementById("btnMute");
  if (!btn) return;
  const m = window.soundMute && window.soundMute.isMuted();
  btn.textContent = m ? "🔇" : "🔊";
  btn.title = m ? "取消靜音" : "靜音";
}

function logout() {
  clearNick();
  document.getElementById("game-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  renderLogin();
}

async function newGame() {
  state.over = false;
  state.cash = INITIAL_CASH;
  state.pos = 0;
  state.avg = 0;
  state.realized = 0;
  state.log = [];
  state.trades = 0;

  const stock = state.stocks[Math.floor(Math.random() * state.stocks.length)];
  state.stock = stock;
  state.prices = await loadPrices(stock.id);

  const minStart = PRE_BARS;
  const maxStart = state.prices.length - TOTAL_ROUNDS - 1;
  if (maxStart <= minStart) {
    // fallback for short histories (253-day stocks)
    state.startIdx = Math.min(PRE_BARS, state.prices.length - TOTAL_ROUNDS - 1);
  } else {
    state.startIdx =
      minStart + Math.floor(Math.random() * (maxStart - minStart));
  }
  state.cursor = state.startIdx;

  renderChart();
  updatePanel();
}

document.getElementById("btnBuy").addEventListener("click", buy);
document.getElementById("btnSell").addEventListener("click", sell);
document.getElementById("btnNext").addEventListener("click", nextDay);
document.getElementById("btnNew").addEventListener("click", () => newGame());
document.getElementById("btnEnd").addEventListener("click", endGameEarly);
document.getElementById("btnMute").addEventListener("click", () => {
  const m = !window.soundMute.isMuted();
  window.soundMute.setMuted(m);
  syncMuteBtn();
  if (!m) window.SFX && SFX.tick();
});
document.getElementById("btnBack").addEventListener("click", () => {
  if (state.pos > 0 && !state.over) {
    if (!confirm("你還有持股，確定要登出?")) return;
  }
  logout();
});
document.getElementById("btnAgain").addEventListener("click", () => {
  document.getElementById("result-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  newGame();
});
document.getElementById("btnBackLogin").addEventListener("click", () => {
  document.getElementById("result-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  renderLogin();
});

document.getElementById("btnLogin").addEventListener("click", () => {
  const v = document.getElementById("nickInput").value.trim();
  if (!v) {
    const inp = document.getElementById("nickInput");
    inp.style.animation = "none";
    setTimeout(() => { inp.style.animation = ""; inp.focus(); }, 10);
    return;
  }
  setNick(v);
  enterGame();
});
document.getElementById("nickInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btnLogin").click();
});
document.getElementById("btnEnter").addEventListener("click", enterGame);
document.getElementById("btnLogout").addEventListener("click", () => {
  clearNick();
  renderLogin();
});

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (document.getElementById("game-screen").classList.contains("hidden")) return;
  if (state.over) return;
  if (e.code === "Space") {
    e.preventDefault();
    nextDay();
  } else if (e.key === "b" || e.key === "B") {
    buy();
  } else if (e.key === "s" || e.key === "S") {
    sell();
  }
});

(function init() {
  renderLogin();
})();
