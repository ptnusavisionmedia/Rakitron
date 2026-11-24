// Efek suara dan musik latar yang disintesis langsung dengan Web Audio, tanpa berkas audio.
// Konteks audio baru dibuat setelah anak menyentuh layar, sesuai aturan autoplay browser.

type Audio = { ctx: AudioContext; out: GainNode; music: GainNode; noise: AudioBuffer };
export type SfxName =
  | "select" | "rotate" | "whoosh" | "snap" | "note" | "fanfare" | "undo"
  | "servo" | "grab" | "release" | "land" | "win" | "magnet";
type PlayOptions = { delay?: number; step?: number; amount?: number };

let audio: Audio | null = null;
let enabled = true;
let musicWanted = false;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let lastServo = 0;
let shift = 0; // penundaan (detik) untuk bunyi yang sedang dijadwalkan

// Nada pentatonik C mayor: setiap komponen yang terpasang menaikkan satu nada.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function ensure(): Audio | null {
  if (audio) return audio;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const compressor = ctx.createDynamicsCompressor();
    const out = ctx.createGain();
    const music = ctx.createGain();
    out.gain.value = .9;
    music.gain.value = .0;
    out.connect(compressor); music.connect(compressor); compressor.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    audio = { ctx, out, music, noise };
  } catch { audio = null; }
  return audio;
}

type Voice = {
  type?: OscillatorType; from: number; to?: number; dur: number; vol: number; at?: number;
  attack?: number; filter?: { type: BiquadFilterType; freq: number; q?: number }; dest?: AudioNode;
};
function tone(a: Audio, v: Voice) {
  const { ctx } = a;
  const start = ctx.currentTime + shift + (v.at ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = v.type ?? "sine";
  osc.frequency.setValueAtTime(v.from, start);
  if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, start + v.dur);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(v.vol, start + (v.attack ?? .006));
  gain.gain.exponentialRampToValueAtTime(.0001, start + v.dur);
  let node: AudioNode = osc;
  if (v.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = v.filter.type; filter.frequency.value = v.filter.freq; filter.Q.value = v.filter.q ?? 1;
    node.connect(filter); node = filter;
  }
  node.connect(gain); gain.connect(v.dest ?? a.out);
  osc.start(start); osc.stop(start + v.dur + .03);
}

type Hiss = { dur: number; vol: number; at?: number; type: BiquadFilterType; from: number; to?: number; q?: number };
function hiss(a: Audio, v: Hiss) {
  const { ctx } = a;
  const start = ctx.currentTime + shift + (v.at ?? 0);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = a.noise; src.loop = true;
  filter.type = v.type; filter.Q.value = v.q ?? 1;
  filter.frequency.setValueAtTime(v.from, start);
  if (v.to) filter.frequency.exponentialRampToValueAtTime(v.to, start + v.dur * .6);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(v.vol, start + Math.min(.03, v.dur / 3));
  gain.gain.exponentialRampToValueAtTime(.0001, start + v.dur);
  src.connect(filter); filter.connect(gain); gain.connect(a.out);
  src.start(start, Math.random() * .5); src.stop(start + v.dur + .03);
}

function bell(a: Audio, freq: number, at: number, vol: number, dur = .7) {
  tone(a, { from: freq, dur, vol, at, attack: .004 });
  tone(a, { from: freq * 2.01, dur: dur * .5, vol: vol * .35, at, attack: .004 });
  tone(a, { from: freq * 3.99, dur: dur * .25, vol: vol * .12, at, attack: .004 });
}

const sounds: Record<SfxName, (a: Audio, o: PlayOptions) => void> = {
  select(a) {
    tone(a, { from: 420, to: 700, dur: .11, vol: .22 });
    tone(a, { type: "triangle", from: 1320, dur: .14, vol: .07, at: .05 });
  },
  rotate(a) {
    hiss(a, { dur: .05, vol: .3, type: "highpass", from: 3200 });
    tone(a, { type: "square", from: 190, to: 120, dur: .07, vol: .07 });
    hiss(a, { dur: .05, vol: .18, at: .085, type: "highpass", from: 3600 });
    tone(a, { type: "square", from: 230, to: 150, dur: .06, vol: .05, at: .085 });
  },
  whoosh(a) { hiss(a, { dur: .3, vol: .22, type: "bandpass", from: 350, to: 2400, q: 1.3 }); },
  snap(a) {
    tone(a, { from: 160, to: 52, dur: .2, vol: .55 });
    hiss(a, { dur: .04, vol: .4, type: "highpass", from: 2400 });
    tone(a, { type: "triangle", from: 1480, to: 1380, dur: .3, vol: .09, at: .005 });
  },
  note(a, o) {
    const f = SCALE[Math.min(SCALE.length - 1, Math.max(0, o.step ?? 0))];
    bell(a, f, 0, .2);
    bell(a, f * 1.5, .09, .12, .5);
  },
  fanfare(a) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(a, { type: "triangle", from: f, dur: .22, vol: .2, at: i * .11 });
      tone(a, { type: "square", from: f, dur: .18, vol: .04, at: i * .11, filter: { type: "lowpass", freq: 2200 } });
    });
    [1046.5, 1318.5, 1568].forEach(f => bell(a, f, .46, .16, 1.1));
    for (let i = 0; i < 6; i++) tone(a, { from: 2000 + Math.random() * 2400, dur: .12, vol: .035, at: .5 + i * .07 });
  },
  undo(a) {
    tone(a, { from: 620, to: 250, dur: .15, vol: .2 });
    hiss(a, { dur: .08, vol: .1, type: "bandpass", from: 1800, to: 500 });
  },
  servo(a, o) {
    const v = Math.min(1, Math.max(0, o.amount ?? .5));
    const f = 150 + v * 320;
    tone(a, { type: "sawtooth", from: f, to: f * 1.12, dur: .09, vol: .05, filter: { type: "lowpass", freq: 1100, q: 4 } });
    tone(a, { type: "square", from: f * 2, dur: .03, vol: .02, at: .04 });
  },
  grab(a) {
    tone(a, { type: "square", from: 300, to: 520, dur: .07, vol: .1, filter: { type: "lowpass", freq: 2200 } });
    hiss(a, { dur: .05, vol: .3, at: .06, type: "highpass", from: 2200 });
    tone(a, { from: 150, to: 70, dur: .12, vol: .3, at: .06 });
    bell(a, 880, .1, .14, .45);
  },
  release(a) {
    tone(a, { from: 560, to: 250, dur: .16, vol: .18 });
    hiss(a, { dur: .18, vol: .12, type: "bandpass", from: 1600, to: 400 });
  },
  land(a) {
    tone(a, { from: 125, to: 42, dur: .26, vol: .6 });
    hiss(a, { dur: .12, vol: .28, type: "lowpass", from: 600 });
  },
  win(a) {
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      tone(a, { type: "triangle", from: f, dur: .24, vol: .2, at: i * .085 });
      bell(a, f * 2, i * .085 + .02, .06, .5);
    });
    [783.99, 1046.5, 1318.5, 1568].forEach(f => bell(a, f, .56, .17, 1.4));
    for (let i = 0; i < 10; i++) tone(a, { from: 1800 + Math.random() * 3000, dur: .14, vol: .035, at: .6 + i * .06 });
  },
  magnet(a) { tone(a, { from: 900, to: 1500, dur: .07, vol: .14 }); },
};

// Lagu latar ringan: akord C - Am - F - G dengan melodi arpeggio dan bas.
const CHORDS = [
  { bass: 48, notes: [60, 64, 67, 72] },
  { bass: 45, notes: [57, 60, 64, 69] },
  { bass: 41, notes: [53, 57, 60, 65] },
  { bass: 43, notes: [55, 59, 62, 67] },
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
const STEP = 60 / 108 / 2;
let nextStep = 0;
let stepIndex = 0;

function scheduleMusic() {
  const a = audio;
  if (!a || a.ctx.state !== "running") return;
  if (nextStep < a.ctx.currentTime) { nextStep = a.ctx.currentTime + .05; }
  while (nextStep < a.ctx.currentTime + .4) {
    const bar = Math.floor(stepIndex / 8) % CHORDS.length;
    const beat = stepIndex % 8;
    const chord = CHORDS[bar];
    const at = nextStep - a.ctx.currentTime;
    const lift = Math.floor(stepIndex / 32) % 2 === 1 ? 12 : 0;
    if (beat % 4 === 0) tone(a, { type: "triangle", from: midi(chord.bass), dur: STEP * 3.4, vol: .5, at, dest: a.music });
    tone(a, { type: "sine", from: midi(chord.notes[ARP[beat]] + lift), dur: STEP * 1.9, vol: .32, at, attack: .01, dest: a.music });
    if (beat % 2 === 1) hiss(a, { dur: .03, vol: .05, at, type: "highpass", from: 7000 });
    nextStep += STEP;
    stepIndex++;
  }
}

function applyMusic() {
  const a = audio;
  if (!a) return;
  const on = musicWanted;
  a.music.gain.cancelScheduledValues(a.ctx.currentTime);
  a.music.gain.linearRampToValueAtTime(on ? .17 : 0, a.ctx.currentTime + .4);
  if (on && !musicTimer) { nextStep = 0; musicTimer = setInterval(scheduleMusic, 110); scheduleMusic(); }
  if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

export const sfx = {
  /** Panggil dari gestur pengguna (sentuhan atau tombol) agar audio boleh berbunyi. */
  unlock() {
    const a = ensure();
    if (!a) return Promise.resolve();
    return a.ctx.state === "running" ? Promise.resolve() : a.ctx.resume().then(() => applyMusic()).catch(() => {});
  },
  setEnabled(value: boolean) { enabled = value; },
  setMusic(value: boolean) { musicWanted = value; ensure(); applyMusic(); },
  play(name: SfxName, options: PlayOptions = {}) {
    if (!enabled) return;
    const a = audio;
    if (!a || a.ctx.state !== "running") return;
    if (name === "servo") {
      const now = a.ctx.currentTime;
      if (now - lastServo < .06) return;
      lastServo = now;
    }
    // Penundaan memakai jam audio sehingga bunyi jatuh tepat pada tumbukan animasi.
    shift = options.delay ?? 0;
    try { sounds[name](a, options); } finally { shift = 0; }
  },
};
