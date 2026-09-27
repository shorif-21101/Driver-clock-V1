// ==========================================
// SOUND EFFECTS (Web Audio API — synthesized, no audio files)
// Aesthetic: engineered / aerospace — turbine spool + clean confirmation tone
// ==========================================

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// A layer of filtered noise that sweeps in frequency — the "turbine air" texture
function playTurbineNoise({ duration, startTime = 0, gain = 0.05, filterStart, filterEnd, q = 0.9 }) {
  const ctx = getAudioCtx();
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(filterStart, ctx.currentTime + startTime);
  filter.frequency.exponentialRampToValueAtTime(filterEnd, ctx.currentTime + startTime + duration);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.0001, ctx.currentTime + startTime);
  gainNode.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + startTime + duration * 0.4);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);

  noise.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  noise.start(ctx.currentTime + startTime);
  noise.stop(ctx.currentTime + startTime + duration + 0.05);
}

// The deep "engine" body of the sound — a low tone sweeping through a filter
function playEngineTone({ duration, startTime = 0, gain = 0.06, freqStart, freqEnd, filterStart, filterEnd }) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(freqStart, ctx.currentTime + startTime);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + startTime + duration);

  filter.type = "lowpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(filterStart, ctx.currentTime + startTime);
  filter.frequency.exponentialRampToValueAtTime(filterEnd, ctx.currentTime + startTime + duration);

  gainNode.gain.setValueAtTime(0.0001, ctx.currentTime + startTime);
  gainNode.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + startTime + duration * 0.3);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration + 0.05);
}

// A clean, pure confirmation ping — the "premium UI" touch
function playConfirmPing({ freq, duration = 0.5, startTime = 0, gain = 0.05 }) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

  gainNode.gain.setValueAtTime(0.0001, ctx.currentTime + startTime);
  gainNode.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + startTime + 0.04);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration + 0.05);
}

function playClockInSound() {
  // Turbine spooling UP, then a clean confirmation ping lands on top — ~1.4s total
  playTurbineNoise({ duration: 0.9, gain: 0.045, filterStart: 200, filterEnd: 2200, q: 0.8 });
  playEngineTone({ duration: 1.1, gain: 0.06, freqStart: 60, freqEnd: 180, filterStart: 300, filterEnd: 2800 });
  playConfirmPing({ freq: 880, duration: 0.6, startTime: 0.75, gain: 0.045 });
  playConfirmPing({ freq: 1318.5, duration: 0.5, startTime: 0.82, gain: 0.03 });
}

function playClockOutSound() {
  // Turbine spooling DOWN, settling into a low, solid confirmation tone — ~1.4s total
  playTurbineNoise({ duration: 0.95, gain: 0.045, filterStart: 2200, filterEnd: 180, q: 0.8 });
  playEngineTone({ duration: 1.15, gain: 0.06, freqStart: 190, freqEnd: 55, filterStart: 2800, filterEnd: 260 });
  playConfirmPing({ freq: 220, duration: 0.7, startTime: 0.8, gain: 0.05 });
}

function playTargetSetSound() {
  // Unchanged — the confirmation chime you already liked
  playTone({ freq: 523.25, duration: 0.09, type: "square", gain: 0.045 });
  playTone({ freq: 783.99, duration: 0.12, type: "square", startTime: 0.1, gain: 0.045 });
}

// Kept for playTargetSetSound above
function playTone({ freq, duration = 0.15, type = "sine", startTime = 0, gain = 0.06 }) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

  gainNode.gain.setValueAtTime(gain, ctx.currentTime + startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration + 0.02);
}