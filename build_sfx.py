"""Synthesize 7 SFX WAV files to assets/sfx/ (no deps, pure stdlib)."""
import math
import struct
import wave
from pathlib import Path

SR = 22050
OUT = Path(__file__).parent / "assets" / "sfx"
OUT.mkdir(parents=True, exist_ok=True)


def osc(t, freq, kind):
    phase = (t * freq) % 1.0
    if kind == "sine":
        return math.sin(2 * math.pi * phase)
    if kind == "square":
        return 1.0 if phase < 0.5 else -1.0
    if kind == "triangle":
        return 4 * abs(phase - 0.5) - 1
    if kind == "sawtooth":
        return 2 * phase - 1
    return 0.0


def freq_sweep(t, dur, f0, f1):
    if f1 is None or f1 == f0:
        return f0
    # exponential sweep
    ratio = f1 / f0
    return f0 * (ratio ** (t / dur))


def tone(buf, start_s, dur, freq, kind="sine", vol=0.15, f_end=None, attack=0.005, fade=0.02):
    n_start = int(start_s * SR)
    n_dur = int(dur * SR)
    phase = 0.0
    prev_f = None
    for i in range(n_dur):
        t = i / SR
        f = freq_sweep(t, dur, freq, f_end)
        if prev_f is None:
            prev_f = f
        phase += (f / SR)
        phase %= 1.0
        if kind == "sine":
            s = math.sin(2 * math.pi * phase)
        elif kind == "square":
            s = 1.0 if phase < 0.5 else -1.0
        elif kind == "triangle":
            s = 4 * abs(phase - 0.5) - 1
        elif kind == "sawtooth":
            s = 2 * phase - 1
        else:
            s = 0.0

        # envelope: attack linear + exponential decay
        if t < attack:
            env = t / attack
        else:
            # exponential decay from vol to ~0
            env = math.exp(-3.0 * (t - attack) / max(dur - attack, 0.001))
        # fade last segment smooth
        tail = dur - t
        if tail < fade:
            env *= max(tail / fade, 0)

        idx = n_start + i
        if idx < len(buf):
            buf[idx] += s * vol * env


def render(events, duration):
    total = int(duration * SR)
    buf = [0.0] * total
    for ev in events:
        tone(buf, **ev)
    # clip
    peak = max((abs(x) for x in buf), default=1.0)
    if peak > 1.0:
        buf = [x / peak for x in buf]
    return buf


def write_wav(name, samples):
    path = OUT / f"{name}.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # 16-bit
        w.setframerate(SR)
        data = b"".join(
            struct.pack("<h", max(-32768, min(32767, int(s * 32767))))
            for s in samples
        )
        w.writeframes(data)
    print(f"  {name}.wav  {path.stat().st_size // 1024} KB")


# ===== definitions =====
SFX = {
    "buy": (
        0.20,
        [
            dict(start_s=0, dur=0.08, freq=440, kind="square", vol=0.35, f_end=880),
            dict(start_s=0.04, dur=0.10, freq=880, kind="triangle", vol=0.25),
        ],
    ),
    "sell_win": (
        0.22,
        [
            dict(start_s=0, dur=0.08, freq=660, kind="square", vol=0.35, f_end=1320),
            dict(start_s=0.04, dur=0.12, freq=1320, kind="triangle", vol=0.25),
        ],
    ),
    "sell_lose": (
        0.18,
        [
            dict(start_s=0, dur=0.14, freq=330, kind="sawtooth", vol=0.35, f_end=165),
        ],
    ),
    "tick": (
        0.04,
        [
            dict(start_s=0, dur=0.025, freq=1200, kind="square", vol=0.18),
        ],
    ),
    "win": (
        0.70,
        [
            dict(start_s=0.00, dur=0.18, freq=523, kind="triangle", vol=0.35),
            dict(start_s=0.08, dur=0.18, freq=659, kind="triangle", vol=0.35),
            dict(start_s=0.16, dur=0.18, freq=784, kind="triangle", vol=0.35),
            dict(start_s=0.24, dur=0.18, freq=1047, kind="triangle", vol=0.35),
            dict(start_s=0.32, dur=0.30, freq=1319, kind="triangle", vol=0.40),
        ],
    ),
    "lose": (
        0.80,
        [
            dict(start_s=0.00, dur=0.30, freq=330, kind="sawtooth", vol=0.35, f_end=110),
            dict(start_s=0.20, dur=0.40, freq=220, kind="sine", vol=0.30, f_end=80),
        ],
    ),
    "login": (
        0.30,
        [
            dict(start_s=0.00, dur=0.08, freq=200, kind="square", vol=0.25, f_end=800),
            dict(start_s=0.06, dur=0.06, freq=1200, kind="square", vol=0.25),
            dict(start_s=0.12, dur=0.12, freq=1600, kind="triangle", vol=0.30),
        ],
    ),
    "error": (
        0.22,
        [
            dict(start_s=0.00, dur=0.08, freq=200, kind="sawtooth", vol=0.35),
            dict(start_s=0.08, dur=0.12, freq=150, kind="sawtooth", vol=0.35),
        ],
    ),
}


def main():
    for name, (dur, events) in SFX.items():
        samples = render(events, dur)
        write_wav(name, samples)
    print(f"\nDone. Output: {OUT}")


if __name__ == "__main__":
    main()
