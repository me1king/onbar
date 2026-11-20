export type OrderAlertTone = {
  id: string;
  name: string;
  frequencies: number[];
  waveform: OscillatorType;
};

export const DEFAULT_ORDER_ALERT_TONES: OrderAlertTone[] = [
  { id: 'classic', name: 'Classic chime', frequencies: [880, 1174, 880], waveform: 'sine' },
  { id: 'rising', name: 'Rising bell', frequencies: [523, 659, 784, 1046], waveform: 'triangle' },
  { id: 'marimba', name: 'Marimba steps', frequencies: [784, 1046, 1318, 1046], waveform: 'sine' },
  { id: 'soft', name: 'Soft double tone', frequencies: [659, 880], waveform: 'triangle' },
  { id: 'urgent', name: 'Urgent pulse', frequencies: [880, 1320, 880, 1320], waveform: 'square' }
];

export function parseToneFrequencies(value: string) {
  const entries = value.split(',').map(item => item.trim());
  if (entries.length < 2 || entries.length > 8 || entries.some(item => !item)) return null;
  const frequencies = entries.map(Number);
  if (frequencies.some(frequency => !Number.isFinite(frequency) || frequency < 250 || frequency > 1800)) return null;
  return frequencies.map(Math.round);
}

export function playOrderAlertTone(
  audio: AudioContext,
  tone: OrderAlertTone,
  volume: number,
  urgent = false
) {
  if (audio.state !== 'running' || volume <= 0) return;
  const frequencies = urgent ? [...tone.frequencies, ...tone.frequencies] : tone.frequencies;
  const step = urgent ? 0.13 : 0.18;
  const duration = urgent ? 0.12 : 0.16;
  const now = audio.currentTime;

  frequencies.forEach((frequency, index) => {
    const start = now + index * step;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = urgent ? 'sawtooth' : tone.waveform;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.002, volume * (urgent ? 0.2 : 0.16)), start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  });
}
