// Web Audio synth — no external assets
const LS_MUTE = "trendgame_mute";

let ctx = null;
let muted = localStorage.getItem(LS_MUTE) === "1";

function ensureCtx() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function isMuted() { return muted; }
function setMuted(v) {
  muted = !!v;
  localStorage.setItem(LS_MUTE, muted ? "1" : "0");
}

// Core tone generator
function tone({ freq, dur = 0.12, type = "sine", vol = 0.15, attack = 0.005, decay = 0.1, freqEnd = null }) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), now + dur);
  }
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

function chord(freqs, opts = {}) {
  freqs.forEach((f, i) => {
    setTimeout(() => tone({ freq: f, ...opts }), i * (opts.stagger || 0));
  });
}

// ========== Sound effects ==========
const SFX = {
  click: () => tone({ freq: 800, dur: 0.04, type: "square", vol: 0.05 }),

  buy: () => {
    tone({ freq: 440, dur: 0.08, type: "square", vol: 0.12, freqEnd: 880 });
    setTimeout(() => tone({ freq: 880, dur: 0.1, type: "triangle", vol: 0.08 }), 40);
  },

  sell: (profit = true) => {
    if (profit) {
      tone({ freq: 660, dur: 0.08, type: "square", vol: 0.12, freqEnd: 1320 });
      setTimeout(() => tone({ freq: 1320, dur: 0.12, type: "triangle", vol: 0.08 }), 40);
    } else {
      tone({ freq: 330, dur: 0.12, type: "sawtooth", vol: 0.12, freqEnd: 165 });
    }
  },

  tick: () => tone({ freq: 1200, dur: 0.025, type: "square", vol: 0.04 }),

  win: () => {
    const notes = [523, 659, 784, 1047, 1319]; // C E G C E
    notes.forEach((f, i) => {
      setTimeout(
        () => tone({ freq: f, dur: 0.18, type: "triangle", vol: 0.14 }),
        i * 80
      );
    });
  },

  lose: () => {
    tone({ freq: 330, dur: 0.3, type: "sawtooth", vol: 0.12, freqEnd: 110 });
    setTimeout(
      () => tone({ freq: 220, dur: 0.4, type: "sine", vol: 0.1, freqEnd: 80 }),
      200
    );
  },

  login: () => {
    tone({ freq: 200, dur: 0.08, type: "square", vol: 0.08, freqEnd: 800 });
    setTimeout(() => tone({ freq: 1200, dur: 0.06, type: "square", vol: 0.08 }), 60);
    setTimeout(() => tone({ freq: 1600, dur: 0.1, type: "triangle", vol: 0.1 }), 120);
  },

  error: () => {
    tone({ freq: 200, dur: 0.08, type: "sawtooth", vol: 0.15 });
    setTimeout(() => tone({ freq: 150, dur: 0.12, type: "sawtooth", vol: 0.15 }), 80);
  },
};

window.SFX = SFX;
window.soundMute = { isMuted, setMuted };
