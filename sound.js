// Audio element-based SFX — reliable on mobile browsers
const LS_MUTE = "trendgame_mute";

const FILES = {
  buy: "assets/sfx/buy.wav",
  sell_win: "assets/sfx/sell_win.wav",
  sell_lose: "assets/sfx/sell_lose.wav",
  tick: "assets/sfx/tick.wav",
  win: "assets/sfx/win.wav",
  lose: "assets/sfx/lose.wav",
  login: "assets/sfx/login.wav",
  error: "assets/sfx/error.wav",
};

let muted = localStorage.getItem(LS_MUTE) === "1";
const pool = {};

function preload() {
  for (const [k, src] of Object.entries(FILES)) {
    const a = new Audio(src);
    a.preload = "auto";
    a.volume = 0.7;
    pool[k] = a;
  }
}
preload();

function play(name) {
  if (muted) return;
  const tmpl = pool[name];
  if (!tmpl) return;
  // 每次 clone 一個新 Audio, 避免同聲部打架
  try {
    const a = tmpl.cloneNode();
    a.volume = tmpl.volume;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

function isMuted() { return muted; }
function setMuted(v) {
  muted = !!v;
  localStorage.setItem(LS_MUTE, muted ? "1" : "0");
}

// 第一次使用者互動時嘗試喚醒 (iOS/Android)
function unlock() {
  Object.values(pool).forEach((a) => {
    const p = a.play();
    if (p && p.then) {
      p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
    }
  });
}
function setupUnlock() {
  const events = ["touchstart", "touchend", "mousedown", "click", "keydown"];
  let done = false;
  const handler = () => {
    if (done) return;
    done = true;
    unlock();
    events.forEach((ev) => document.removeEventListener(ev, handler, true));
  };
  events.forEach((ev) =>
    document.addEventListener(ev, handler, { capture: true, passive: true })
  );
}
setupUnlock();

const SFX = {
  click: () => play("tick"),
  buy: () => play("buy"),
  sell: (profit = true) => play(profit ? "sell_win" : "sell_lose"),
  tick: () => play("tick"),
  win: () => play("win"),
  lose: () => play("lose"),
  login: () => play("login"),
  error: () => play("error"),
};

window.SFX = SFX;
window.soundMute = { isMuted, setMuted };
