const INITIAL_CASH = 1_000_000;
const TOTAL_ROUNDS = 100;
const PRE_BARS = 120; // MA60 + buffer
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

let chart, candleSeries, volumeSeries, ma5Line, ma20Line, ma60Line;

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

  window.addEventListener("resize", () => chart.applyOptions({}));
}

function renderChart() {
  const slice = state.prices.slice(0, state.cursor + 1);
  candleSeries.setData(slice.map(toCandle));
  volumeSeries.setData(slice.map(toVol));
  ma5Line.setData(ma(slice, 5));
  ma20Line.setData(ma(slice, 20));
  ma60Line.setData(ma(slice, 60));
  chart.timeScale().fitContent();
}

function appendBar() {
  const p = state.prices[state.cursor];
  candleSeries.update(toCandle(p));
  volumeSeries.update(toVol(p));
  // refresh MAs (cheap for our sizes)
  const slice = state.prices.slice(0, state.cursor + 1);
  ma5Line.setData(ma(slice, 5));
  ma20Line.setData(ma(slice, 20));
  ma60Line.setData(ma(slice, 60));
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
  document.getElementById("stockLabel").textContent =
    `${state.stock.id} ${state.stock.name}`;
  document.getElementById("dateLabel").textContent = nowDate();
  document.getElementById("roundsLeft").textContent =
    TOTAL_ROUNDS - state.trades > 0
      ? TOTAL_ROUNDS - (state.cursor - state.startIdx)
      : 0;
  document.getElementById("priceNow").textContent = fmt(price, 2);
  document.getElementById("pos").textContent = fmt(state.pos);
  document.getElementById("avg").textContent =
    state.pos > 0 ? fmt(state.avg, 2) : "—";
  const unreal =
    state.pos > 0 ? (price - state.avg) * state.pos : 0;
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
  const qty = +document.getElementById("qty").value;
  if (qty <= 0) return;
  const price = nowPrice();
  const cost = qty * price;
  const fee = Math.max(20, Math.floor(cost * FEE_RATE));
  const total = cost + fee;
  if (total > state.cash) {
    alert("現金不足");
    return;
  }
  const newAvg = (state.avg * state.pos + cost) / (state.pos + qty);
  state.pos += qty;
  state.avg = newAvg;
  state.cash -= total;
  state.trades++;
  state.log.push({ t: nowDate(), side: "buy", qty, p: price });
  updatePanel();
  checkEnd();
}

function sell() {
  if (state.over) return;
  let qty = +document.getElementById("qty").value;
  if (qty <= 0) return;
  if (qty > state.pos) qty = state.pos;
  if (qty <= 0) {
    alert("無持股");
    return;
  }
  const price = nowPrice();
  const gross = qty * price;
  const fee = Math.max(20, Math.floor(gross * FEE_RATE));
  const tax = Math.floor(gross * TAX_RATE);
  const net = gross - fee - tax;
  const pnl = (price - state.avg) * qty - fee - tax;
  state.pos -= qty;
  if (state.pos === 0) state.avg = 0;
  state.cash += net;
  state.realized += pnl;
  state.trades++;
  state.log.push({ t: nowDate(), side: "sell", qty, p: price, pnl });
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
  // force-close position for final equity
  const equity = state.cash + state.pos * price;
  const roi = ((equity - INITIAL_CASH) / INITIAL_CASH) * 100;

  // benchmark: buy & hold from start to now
  const startPrice = state.prices[state.startIdx].c;
  const bench = ((price - startPrice) / startPrice) * 100;

  setTimeout(() => {
    alert(
      `遊戲結束\n\n` +
        `${state.stock.id} ${state.stock.name}\n` +
        `${state.prices[state.startIdx].t} → ${nowDate()}\n` +
        `\n總資產 ${fmt(equity, 0)}\n` +
        `報酬率 ${roi >= 0 ? "+" : ""}${roi.toFixed(2)}%\n` +
        `大盤對照(買入持有) ${bench >= 0 ? "+" : ""}${bench.toFixed(2)}%\n` +
        `超越 ${(roi - bench >= 0 ? "+" : "")}${(roi - bench).toFixed(2)}%`
    );
  }, 100);
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
document.getElementById("btnNew").addEventListener("click", newGame);
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") {
    e.preventDefault();
    nextDay();
  } else if (e.key === "b" || e.key === "B") {
    buy();
  } else if (e.key === "s" || e.key === "S") {
    sell();
  }
});

(async function init() {
  setupChart();
  await loadCatalog();
  await newGame();
})();
