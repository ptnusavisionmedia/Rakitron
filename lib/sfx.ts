// Efek suara dan musik latar bergaya fiksi ilmiah, disintesis langsung dengan Web Audio tanpa berkas audio:
// hidrolik servo, desis pneumatik, kunci magnet, ping antarmuka holografik, dan suara robot.
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
    // Gema pendek yang redup memberi ruang seperti bengkel logam futuristik.
    const send = ctx.createGain(), delay = ctx.createDelay(.5), feedback = ctx.createGain(), damp = ctx.createBiquadFilter();
    send.gain.value = .22; delay.delayTime.value = .13; feedback.gain.value = .34;
    damp.type = "lowpass"; damp.frequency.value = 3200;
    out.connect(send); send.connect(delay); delay.connect(damp); damp.connect(feedback); feedback.connect(delay); damp.connect(compressor);
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

// Ping antarmuka holografik: sinus bersih dengan harmonik tinggi redup.
function ping(a: Audio, freq: number, at: number, vol: number, dur = .22) {
  tone(a, { from: freq, to: freq * 1.012, dur, vol, at, attack: .002 });
  tone(a, { from: freq * 2, dur: dur * .5, vol: vol * .3, at, attack: .002 });
  tone(a, { from: freq * 3.01, dur: dur * .25, vol: vol * .12, at, attack: .002 });
}

// Gigi gergaji dengan penyaring beresonansi yang menyapu: bunyi daya menyala atau hidrolik.
type Sweep = { type?: OscillatorType; from: number; to: number; dur: number; vol: number; at?: number; fFrom: number; fTo: number; q?: number };
function sweep(a: Audio, v: Sweep) {
  const { ctx } = a;
  const start = ctx.currentTime + shift + (v.at ?? 0);
  const osc = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = v.type ?? "sawtooth"; sub.type = "square";
  osc.frequency.setValueAtTime(v.from, start); osc.frequency.exponentialRampToValueAtTime(v.to, start + v.dur);
  sub.frequency.setValueAtTime(v.from / 2, start); sub.frequency.exponentialRampToValueAtTime(v.to / 2, start + v.dur);
  filter.type = "lowpass"; filter.Q.value = v.q ?? 8;
  filter.frequency.setValueAtTime(v.fFrom, start); filter.frequency.exponentialRampToValueAtTime(v.fTo, start + v.dur);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(v.vol, start + Math.min(.05, v.dur / 3));
  gain.gain.exponentialRampToValueAtTime(.0001, start + v.dur);
  osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(a.out);
  osc.start(start); sub.start(start); osc.stop(start + v.dur + .03); sub.stop(start + v.dur + .03);
}

// Desis servo hidrolik: gigi gergaji bergetar halus dengan penyaring yang mengikuti nada.
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
  lfo.frequency.value = 46; lfoGain.gain.value = from * .04;
  filter.type = "bandpass"; filter.Q.value = 6;
  filter.frequency.setValueAtTime(from * 2.6, start);
  filter.frequency.exponentialRampToValueAtTime(to * 2.6, start + dur);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + Math.min(.02, dur / 3));
  gain.gain.exponentialRampToValueAtTime(.0001, start + dur);
  lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
  osc.connect(filter); filter.connect(gain); gain.connect(a.out);
  osc.start(start); lfo.start(start);
  osc.stop(start + dur + .03); lfo.stop(start + dur + .03);
}

// Desis pneumatik: semburan udara bertekanan yang cepat melemah.
function psst(a: Audio, at: number, vol: number, dur = .22) {
  hiss(a, { dur, vol, at, type: "highpass", from: 5200, q: .7 });
  hiss(a, { dur: dur * .8, vol: vol * .5, at, type: "bandpass", from: 3200, to: 1400, q: 1.2 });
}

// Kunci mekanis: hentakan magnet rendah, klik logam, dan denting pegas.
function latch(a: Audio, at: number, vol: number) {
  tone(a, { from: 130, to: 44, dur: .16, vol: vol * 1.5, at, attack: .002 });
  [1, 2.76, 5.4, 8.93].forEach((ratio, i) => tone(a, {
    from: 420 * ratio, dur: .24 / (1 + i * .7), vol: vol * .7 / (1 + i * 1.3), at: at + .012, attack: .001,
  }));
  hiss(a, { dur: .025, vol: vol * .9, at, type: "highpass", from: 3400 });
}

// Suara robot: gigi gergaji berpitch datar melewati dua formant yang bergerak, seperti vokoder.
function voice(a: Audio, syllables: { pitch: number; f1: number; f2: number; dur: number }[], at = 0, vol = .1) {
  const { ctx } = a;
  let t = at;
  for (const s of syllables) {
    const start = ctx.currentTime + shift + t;
    const osc = ctx.createOscillator();
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(s.pitch, start);
    osc.frequency.linearRampToValueAtTime(s.pitch * .94, start + s.dur);
    f1.type = "bandpass"; f1.Q.value = 7; f1.frequency.setValueAtTime(s.f1, start);
    f2.type = "bandpass"; f2.Q.value = 9; f2.frequency.setValueAtTime(s.f2, start);
    f2.frequency.linearRampToValueAtTime(s.f2 * 1.25, start + s.dur);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + s.dur);
    osc.connect(f1); osc.connect(f2); f1.connect(gain); f2.connect(gain); gain.connect(a.out);
    osc.start(start); osc.stop(start + s.dur + .03);
    t += s.dur * .85;
  }
}

const sounds: Record<SfxName, (a: Audio, o: PlayOptions) => void> = {
  select(a) {
    ping(a, 1568, 0, .1, .14);
    ping(a, 2349, .06, .08, .16);
    sweep(a, { from: 120, to: 260, dur: .1, vol: .05, fFrom: 500, fTo: 1400 });
  },
  rotate(a) {
    // Roda gigi berputar seperempat putaran: tiga klik cepat dengan desis servo.
    whine(a, 210, 330, .14, .06);
    [0, .045, .09].forEach((t, i) => {
      hiss(a, { dur: .02, vol: .22, at: t, type: "highpass", from: 3800 });
      tone(a, { type: "square", from: 260 + i * 60, dur: .025, vol: .05, at: t, attack: .001 });
    });
    psst(a, .12, .04, .1);
  },
  whoosh(a) {
    sweep(a, { from: 70, to: 330, dur: .27, vol: .13, fFrom: 220, fTo: 2800, q: 6 });
    whine(a, 380, 900, .25, .05);
    psst(a, 0, .05, .27);
  },
  snap(a) {
    latch(a, 0, .4);
    psst(a, .05, .09, .26);
    ping(a, 1760, .1, .08, .16);
    ping(a, 2637, .17, .07, .22);
  },
  note(a, o) {
    // Tiap komponen yang terpasang menyalakan satu modul: ping naik nada dengan dengung daya.
    const f = SCALE[Math.min(SCALE.length - 1, Math.max(0, o.step ?? 0))];
    ping(a, f * 2, 0, .1, .26);
    ping(a, f * 3, .075, .07, .3);
    sweep(a, { from: f / 2, to: f, dur: .2, vol: .05, at: .02, fFrom: 400, fTo: 2200, q: 5 });
  },
  fanfare(a) {
    // Seluruh sistem menyala: dengung daya naik, akord ping berlapis, lalu sapuan bunga api digital.
    sweep(a, { from: 60, to: 520, dur: .55, vol: .17, fFrom: 180, fTo: 5200, q: 7 });
    latch(a, .5, .28);
    [523.25, 783.99, 1046.5, 1568].forEach((f, i) => ping(a, f * 2, .52 + i * .035, .09, 1.1));
    [2093, 2637, 3136, 3951, 4699].forEach((f, i) => ping(a, f, .72 + i * .06, .045, .35));
    psst(a, .5, .08, .5);
  },
  undo(a) {
    sweep(a, { from: 520, to: 90, dur: .2, vol: .1, fFrom: 3200, fTo: 260, q: 6 });
    ping(a, 1175, 0, .07, .12);
    ping(a, 784, .07, .07, .15);
    psst(a, .1, .05, .12);
  },
  servo(a, o) {
    const v = Math.min(1, Math.max(0, o.amount ?? .5));
    const f = 190 + v * 330;
    whine(a, f, f * 1.12, .1, .07);
    tone(a, { type: "square", from: f * 5, dur: .02, vol: .012, at: .05 });
    hiss(a, { dur: .02, vol: .04, at: .07, type: "highpass", from: 5000 });
  },
  grab(a) {
    whine(a, 230, 520, .1, .09);
    latch(a, .09, .36);
    psst(a, .12, .08, .22);
    ping(a, 2093, .2, .06, .16);
  },
  release(a) {
    psst(a, 0, .11, .24);
    whine(a, 520, 220, .14, .07, .03);
    tone(a, { from: 180, to: 90, dur: .09, vol: .16, at: .1, attack: .002 });
    ping(a, 1319, .14, .05, .14);
  },
  land(a) {
    tone(a, { from: 110, to: 38, dur: .3, vol: .6 });
    latch(a, .01, .24);
    hiss(a, { dur: .14, vol: .22, type: "lowpass", from: 700 });
  },
  win(a) {
    sweep(a, { from: 55, to: 660, dur: .7, vol: .17, fFrom: 160, fTo: 6000, q: 7 });
    latch(a, .66, .3);
    [392, 587.33, 783.99, 1174.7, 1568].forEach((f, i) => ping(a, f * 2, .68 + i * .04, .09, 1.5));
    voice(a, [
      { pitch: 118, f1: 420, f2: 1900, dur: .13 },
      { pitch: 134, f1: 700, f2: 1200, dur: .13 },
      { pitch: 158, f1: 300, f2: 2300, dur: .22 },
    ], .8, .16);
    [3136, 3951, 4699, 3951, 4699, 6272].forEach((f, i) => ping(a, f, 1 + i * .06, .04, .3));
    psst(a, .66, .09, .6);
  },
  magnet(a) {
    tone(a, { from: 1800, to: 3400, dur: .06, vol: .08 });
    hiss(a, { dur: .05, vol: .09, type: "bandpass", from: 4200, q: 4 });
  },
};

// Lagu latar fiksi ilmiah: bantalan synth gigi gergaji, bas berdenyut, dan arpeggio ping digital.
const CHORDS = [
  { bass: 45, notes: [57, 60, 64, 69] },
  { bass: 41, notes: [53, 57, 60, 65] },
  { bass: 48, notes: [60, 64, 67, 72] },
  { bass: 43, notes: [55, 59, 62, 67] },
];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
const STEP = 60 / 100 / 2;
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
    if (beat === 0) {
      // Bantalan akord dua gigi gergaji yang sedikit menyimpang nada agar terdengar lebar.
      for (const note of chord.notes.slice(0, 3)) {
        for (const detune of [-.4, .4]) {
          tone(a, { type: "sawtooth", from: midi(note) * (1 + detune * .01), dur: STEP * 7.6, vol: .035, at, attack: .5, dest: a.music, filter: { type: "lowpass", freq: 900, q: 1 } });
        }
      }
    }
    if (beat % 2 === 0) tone(a, { type: "sawtooth", from: midi(chord.bass), dur: STEP * 1.4, vol: .3, at, dest: a.music, filter: { type: "lowpass", freq: 380, q: 5 } });
    tone(a, { type: "sine", from: midi(chord.notes[ARP[beat]] + 12 + lift), dur: STEP * 1.6, vol: .14, at, attack: .003, dest: a.music });
    tone(a, { type: "sine", from: midi(chord.notes[ARP[beat]] + 24 + lift), dur: STEP * .6, vol: .04, at, attack: .003, dest: a.music });
    if (beat % 2 === 1) hiss(a, { dur: .02, vol: .05, at, type: "highpass", from: 9000 });
    if (beat === 4) tone(a, { from: 140, to: 48, dur: .12, vol: .3, at, attack: .002, dest: a.music });
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
