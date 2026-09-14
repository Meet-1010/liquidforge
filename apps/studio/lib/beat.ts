/**
 * Reading a track ahead of time, so a render can move with it exactly.
 *
 * A live analyser hears whatever is playing when a frame happens to be drawn,
 * which for a render that runs slower than real time is nothing useful. So the
 * whole track is analysed once, in the browser: a loudness envelope for the
 * body of the sound, a low-passed one for the kick, and the moments the kick
 * lands. Every frame then looks its time up.
 */

export interface TrackAnalysis {
  /** Envelope samples per second. */
  rate: number
  duration: number
  /** Whole-band loudness, 0–1-ish, normalised to the track's own loud parts. */
  level: Float32Array
  /** Loudness under about 150 Hz: kick and bass. */
  low: Float32Array
}

export interface Onsets {
  times: number[]
  /** How hard each one hit, 0.4–1.4. */
  strengths: number[]
}

const RATE = 120

function rmsEnvelope(data: Float32Array, sampleRate: number, rate: number): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate / rate))
  const frames = Math.max(1, Math.floor(data.length / hop))
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    // Two hops wide, so the envelope does not flicker between neighbours.
    const start = i * hop
    const end = Math.min(data.length, start + hop * 2)
    let sum = 0
    for (let j = start; j < end; j++) sum += data[j] * data[j]
    out[i] = Math.sqrt(sum / Math.max(1, end - start))
  }
  // Normalised to the 95th percentile rather than the peak, so one clipped
  // snare does not make the rest of the song look quiet.
  const sorted = Float32Array.from(out).sort()
  const reference = sorted[Math.floor(sorted.length * 0.95)] || 1
  for (let i = 0; i < frames; i++) out[i] = Math.min(1.25, out[i] / reference)
  return out
}

export async function analyseTrack(buffer: AudioBuffer): Promise<TrackAnalysis> {
  const mono = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels
  }

  const sampleRate = 11025
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(buffer.duration * sampleRate)), sampleRate)
  const source = offline.createBufferSource()
  source.buffer = buffer
  const lowpass = offline.createBiquadFilter()
  lowpass.type = "lowpass"
  lowpass.frequency.value = 150
  lowpass.Q.value = 0.8
  source.connect(lowpass).connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()

  return {
    rate: RATE,
    duration: buffer.duration,
    level: rmsEnvelope(mono, buffer.sampleRate, RATE),
    low: rmsEnvelope(rendered.getChannelData(0), sampleRate, RATE),
  }
}

/**
 * Where the kick lands: the low envelope rising well above its own recent
 * average. `sensitivity` 1 is a sensible default; higher finds more hits.
 */
export function findOnsets(analysis: TrackAnalysis, sensitivity = 1): Onsets {
  const { low, rate } = analysis
  const novelty = new Float32Array(low.length)
  const back = Math.round(rate * 0.1)
  for (let i = 1; i < low.length; i++) {
    let sum = 0
    const from = Math.max(0, i - back)
    for (let j = from; j < i; j++) sum += low[j]
    novelty[i] = Math.max(0, low[i] - sum / Math.max(1, i - from))
  }

  const times: number[] = []
  const strengths: number[] = []
  const span = Math.round(rate * 0.5)
  const gap = 0.16
  const k = 1.6 / Math.max(0.25, sensitivity)
  let peak = 0
  for (let i = 1; i < novelty.length; i++) peak = Math.max(peak, novelty[i])

  for (let i = 1; i < novelty.length - 1; i++) {
    const value = novelty[i]
    if (value < novelty[i - 1] || value < novelty[i + 1] || value < 0.04) continue
    let sum = 0
    let square = 0
    let count = 0
    for (let j = Math.max(0, i - span); j < Math.min(novelty.length, i + span); j++) {
      sum += novelty[j]
      square += novelty[j] * novelty[j]
      count++
    }
    const mean = sum / count
    const deviation = Math.sqrt(Math.max(0, square / count - mean * mean))
    if (value < mean + k * deviation) continue
    const time = i / rate
    if (times.length && time - times[times.length - 1] < gap) {
      // Two peaks inside one hit: keep the bigger.
      if (value > strengths[strengths.length - 1]) {
        times[times.length - 1] = time
        strengths[strengths.length - 1] = value
      }
      continue
    }
    times.push(time)
    strengths.push(value)
  }
  return { times, strengths: strengths.map((value) => 0.4 + Math.min(1, value / (peak * 0.6 || 1))) }
}

/** The index of the last onset at or before `time`, or -1. */
export function lastOnsetIndex(onsets: Onsets, time: number): number {
  let low = 0
  let high = onsets.times.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (onsets.times[mid] <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

/**
 * A demo beat made in the browser — kick, clap and hats at 124 BPM — so the
 * visualizer has something to move to before a track is chosen, and so the
 * clip it makes can be posted without anyone's rights to think about.
 */
export async function demoBeat(seconds = 16): Promise<AudioBuffer> {
  const sampleRate = 44100
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate)
  const beat = 60 / 124
  const master = context.createGain()
  master.gain.value = 0.8
  master.connect(context.destination)

  const noise = context.createBuffer(1, sampleRate, sampleRate)
  const channel = noise.getChannelData(0)
  for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1

  for (let step = 0; step * beat < seconds; step++) {
    const t = step * beat
    // Kick: a sine falling from 150 Hz to 45 Hz.
    const kick = context.createOscillator()
    const kickGain = context.createGain()
    kick.frequency.setValueAtTime(150, t)
    kick.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    kickGain.gain.setValueAtTime(1, t)
    kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    kick.connect(kickGain).connect(master)
    kick.start(t)
    kick.stop(t + 0.4)

    // Clap on two and four.
    if (step % 2 === 1) {
      const clap = context.createBufferSource()
      clap.buffer = noise
      const band = context.createBiquadFilter()
      band.type = "bandpass"
      band.frequency.value = 1400
      const clapGain = context.createGain()
      clapGain.gain.setValueAtTime(0.5, t)
      clapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      clap.connect(band).connect(clapGain).connect(master)
      clap.start(t, Math.random() * 0.5, 0.2)
    }

    // Off-beat hats.
    const hat = context.createBufferSource()
    hat.buffer = noise
    const high = context.createBiquadFilter()
    high.type = "highpass"
    high.frequency.value = 7000
    const hatGain = context.createGain()
    hatGain.gain.setValueAtTime(0.18, t + beat / 2)
    hatGain.gain.exponentialRampToValueAtTime(0.001, t + beat / 2 + 0.05)
    hat.connect(high).connect(hatGain).connect(master)
    hat.start(t + beat / 2, Math.random() * 0.5, 0.06)

    // A bass note under every other bar, for the envelope to swell with.
    if (step % 8 === 0) {
      const bass = context.createOscillator()
      bass.type = "triangle"
      bass.frequency.value = step % 16 === 0 ? 55 : 49
      const bassGain = context.createGain()
      bassGain.gain.setValueAtTime(0.0001, t)
      bassGain.gain.exponentialRampToValueAtTime(0.35, t + 0.05)
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + beat * 3.5)
      bass.connect(bassGain).connect(master)
      bass.start(t)
      bass.stop(t + beat * 4)
    }
  }
  return context.startRendering()
}
