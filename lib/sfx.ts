// Efek suara dan musik latar bernuansa robot, disintesis langsung dengan Web Audio tanpa berkas audio:
// bunyi servo, bip digital, nada FM logam, dan denting besi.
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

// Nada logam: pembawa dengan modulator FM berfrekuensi tak harmonis sehingga terdengar seperti besi.
type Metal = { from: number; to?: number; dur: number; vol: number; at?: number; ratio?: number; depth?: number };
function metal(a: Audio, v: Metal) {
  const { ctx } = a;
  const start = ctx.currentTime + shift + (v.at ?? 0);
  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const depth = ctx.createGain();
  const gain = ctx.createGain();
  carrier.type = "sine"; mod.type = "sine";
  carrier.frequency.setValueAtTime(v.from, start);
  if (v.to) carrier.frequency.exponentialRampToValueAtTime(v.to, start + v.dur);
  mod.frequency.value = v.from * (v.ratio ?? 2.76);
  depth.gain.setValueAtTime(v.from * (v.depth ?? 1.6), start);
  depth.gain.exponentialRampToValueAtTime(1, start + v.dur);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(v.vol, start + .003);
  gain.gain.exponentialRampToValueAtTime(.0001, start + v.dur);
  mod.connect(depth); depth.connect(carrier.frequency);
  carrier.connect(gain); gain.connect(a.out);
  carrier.start(start); mod.start(start);
  carrier.stop(start + v.dur + .03); mod.stop(start + v.dur + .03);
}

// Rangkaian bip digital cepat berbentuk gelombang kotak, seperti bunyi komputer robot.
function blips(a: Audio, freqs: number[], gap: number, dur: number, vol: number, at = 0) {
  freqs.forEach((f, i) => tone(a, {
    type: "square", from: f, dur, vol, at: at + i * gap, attack: .002,
    filter: { type: "lowpass", freq: Math.min(5200, f * 3.2), q: 2 },
  }));
}

// Desis motor servo: gigi gergaji bergetar halus dengan penyaring yang mengikuti nada.
function whine(a: Audio, from: number, to: number, dur: number, vol: number, at = 0) {
  const { ctx } = a;
  const start = ctx.currentTime + shift + at;
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  lfo.frequency.value = 38; lfoGain.gain.value = from * .035;
  filter.type = "bandpass"; filter.Q.value = 5;
  filter.frequency.setValueAtTime(from * 2.4, start);
  filter.frequency.exponentialRampToValueAtTime(to * 2.4, start + dur);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + Math.min(.02, dur / 3));
  gain.gain.exponentialRampToValueAtTime(.0001, start + dur);
  lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
  osc.connect(filter); filter.connect(gain); gain.connect(a.out);
  osc.start(start); lfo.start(start);
  osc.stop(start + dur + .03); lfo.stop(start + dur + .03);
}

// Denting logam: pecahan nada tak harmonis yang cepat meredam, ditambah klik derau.
function clank(a: Audio, base: number, vol: number, at = 0, dur = .28) {
  [1, 2.76, 5.4, 8.93].forEach((ratio, i) => tone(a, {
    from: base * ratio, dur: dur / (1 + i * .7), vol: vol / (1 + i * 1.3), at, attack: .001,
  }));
  hiss(a, { dur: .03, vol: vol * .9, at, type: "highpass", from: 3000 });
}

const sounds: Record<SfxName, (a: Audio, o: PlayOptions) => void> = {
  select(a) {
    blips(a, [880, 1320], .05, .06, .1);
    whine(a, 260, 420, .1, .06);
  },
  rotate(a) {
    whine(a, 180, 260, .08, .08);
    clank(a, 520, .1, .07, .12);
    whine(a, 200, 150, .07, .06, .1);
  },
  whoosh(a) {
    whine(a, 140, 520, .26, .09);
    hiss(a, { dur: .26, vol: .08, type: "bandpass", from: 500, to: 2600, q: 3 });
  },
  snap(a) {
    clank(a, 330, .3, 0, .32);
    tone(a, { from: 110, to: 45, dur: .16, vol: .5, attack: .002 });
    blips(a, [1760, 2349], .06, .05, .06, .08);
  },
  note(a, o) {
    // Setiap komponen yang terpasang menambah satu bip nada naik, seperti konfirmasi komputer.
    const f = SCALE[Math.min(SCALE.length - 1, Math.max(0, o.step ?? 0))];
    blips(a, [f, f * 1.5], .07, .08, .1);
    metal(a, { from: f * 2, dur: .35, vol: .05, at: .02, ratio: 3.5, depth: .8 });
  },
  fanfare(a) {
    blips(a, [523.25, 659.25, 783.99, 1046.5, 1318.5], .075, .1, .12);
    [1046.5, 1568].forEach((f, i) => metal(a, { from: f, dur: 1, vol: .09, at: .42 + i * .04, ratio: 1.5, depth: .5 }));
    blips(a, [2093, 1568, 2093, 2637], .05, .05, .05, .55);
  },
  undo(a) {
    blips(a, [740, 520], .05, .06, .09);
    whine(a, 420, 160, .14, .07);
  },
  servo(a, o) {
    const v = Math.min(1, Math.max(0, o.amount ?? .5));
    const f = 170 + v * 300;
    whine(a, f, f * 1.1, .1, .08);
    tone(a, { type: "square", from: f * 4, dur: .02, vol: .015, at: .05 });
  },
  grab(a) {
    whine(a, 240, 420, .08, .08);
    clank(a, 410, .28, .07, .22);
    tone(a, { from: 140, to: 60, dur: .12, vol: .3, at: .07 });
    blips(a, [1568, 2093], .05, .05, .07, .14);
  },
  release(a) {
    whine(a, 380, 200, .12, .08);
    clank(a, 300, .16, .08, .16);
    blips(a, [1175, 880], .05, .05, .06, .12);
  },
  land(a) {
    tone(a, { from: 120, to: 42, dur: .26, vol: .6 });
    clank(a, 200, .22, .005, .22);
    hiss(a, { dur: .1, vol: .22, type: "lowpass", from: 600 });
  },
  win(a) {
    blips(a, [392, 523.25, 659.25, 783.99, 1046.5, 1318.5], .08, .1, .13);
    [783.99, 1046.5, 1318.5].forEach((f, i) => metal(a, { from: f, dur: 1.2, vol: .1, at: .55 + i * .05, ratio: 1.5, depth: .5 }));
    blips(a, [2093, 2637, 3136, 2637, 3136, 4186], .055, .05, .045, .6);
    whine(a, 200, 900, .5, .05, .1);
  },
  magnet(a) { blips(a, [1100, 1650], .03, .035, .08); },
};

// Lagu latar elektronik: akord C - Am - F - G dengan bas gigi gergaji, arpeggio kotak, dan hi-hat digital.
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
    if (beat % 4 === 0) tone(a, { type: "sawtooth", from: midi(chord.bass), dur: STEP * 3.2, vol: .3, at, dest: a.music, filter: { type: "lowpass", freq: 420, q: 3 } });
    tone(a, { type: "square", from: midi(chord.notes[ARP[beat]] + lift), dur: STEP * 1.3, vol: .1, at, attack: .004, dest: a.music, filter: { type: "lowpass", freq: 1700, q: 2 } });
    if (beat % 2 === 1) hiss(a, { dur: .025, vol: .06, at, type: "highpass", from: 8000 });
    if (beat === 4) tone(a, { from: 150, to: 55, dur: .11, vol: .35, at, attack: .002, dest: a.music });
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
