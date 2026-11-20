'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_ORDER_ALERT_TONES,
  parseToneFrequencies,
  playOrderAlertTone,
  type OrderAlertTone
} from '@/lib/orderAlertTones';

type TonePreferences = { enabled: boolean; toneId: string; volume: number };
const defaultPreferences: TonePreferences = { enabled: false, toneId: 'classic', volume: 0.65 };
const supportedWaveforms = new Set<OscillatorType>(['sine', 'triangle', 'square', 'sawtooth']);

function isTone(value: unknown): value is OrderAlertTone {
  if (!value || typeof value !== 'object') return false;
  const tone = value as Partial<OrderAlertTone>;
  return typeof tone.id === 'string'
    && tone.id.startsWith('custom-')
    && typeof tone.name === 'string'
    && tone.name.trim().length > 0
    && Array.isArray(tone.frequencies)
    && tone.frequencies.length >= 2
    && tone.frequencies.length <= 8
    && tone.frequencies.every(frequency => Number.isFinite(frequency) && frequency >= 250 && frequency <= 1800)
    && supportedWaveforms.has(tone.waveform as OscillatorType);
}

function loadPreferences(value: string | null): TonePreferences {
  if (!value) return defaultPreferences;
  try {
    const parsed = JSON.parse(value) as Partial<TonePreferences>;
    return {
      enabled: parsed.enabled === true,
      toneId: typeof parsed.toneId === 'string' ? parsed.toneId : defaultPreferences.toneId,
      volume: typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.min(1, Math.max(0, parsed.volume))
        : defaultPreferences.volume
    };
  } catch {
    return defaultPreferences;
  }
}

function loadCustomTones(value: string | null) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isTone) : [];
  } catch {
    return [];
  }
}

export function useOrderAlertTone(preferenceKey: string) {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [customTones, setCustomTones] = useState<OrderAlertTone[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const preferencesRef = useRef(preferences);
  const tonesRef = useRef<OrderAlertTone[]>(DEFAULT_ORDER_ALERT_TONES);
  const tones = useMemo(() => [...DEFAULT_ORDER_ALERT_TONES, ...customTones], [customTones]);
  const storageKey = `ob_order_alert_tones_${preferenceKey}`;
  const customStorageKey = `ob_order_alert_custom_tones_${preferenceKey}`;

  useEffect(() => {
    preferencesRef.current = preferences;
    tonesRef.current = tones;
  }, [preferences, tones]);

  useEffect(() => {
    setLoadedKey(null);
    const nextPreferences = loadPreferences(localStorage.getItem(storageKey));
    const nextCustomTones = loadCustomTones(localStorage.getItem(customStorageKey));
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    setCustomTones(nextCustomTones);
    tonesRef.current = [...DEFAULT_ORDER_ALERT_TONES, ...nextCustomTones];
    setLoadedKey(preferenceKey);
  }, [customStorageKey, preferenceKey, storageKey]);

  useEffect(() => {
    if (loadedKey !== preferenceKey) return;
    localStorage.setItem(storageKey, JSON.stringify(preferences));
    localStorage.setItem(customStorageKey, JSON.stringify(customTones));
  }, [customStorageKey, customTones, loadedKey, preferenceKey, preferences, storageKey]);

  useEffect(() => () => {
    void audioContext.current?.close();
    audioContext.current = null;
  }, []);

  const updatePreferences = useCallback((updates: Partial<TonePreferences>) => {
    setPreferences(current => {
      const next = { ...current, ...updates };
      preferencesRef.current = next;
      return next;
    });
  }, []);

  const selectedTone = tones.find(tone => tone.id === preferences.toneId) || DEFAULT_ORDER_ALERT_TONES[0];

  const getAudioContext = useCallback(async () => {
    if (!('AudioContext' in window)) throw new Error('This browser does not support in-terminal sound alerts.');
    const audio = audioContext.current || new AudioContext();
    audioContext.current = audio;
    await audio.resume();
    return audio;
  }, []);

  const play = useCallback((urgent = false) => {
    const current = preferencesRef.current;
    if (!current.enabled) return;
    const audio = audioContext.current;
    const tone = tonesRef.current.find(item => item.id === current.toneId) || DEFAULT_ORDER_ALERT_TONES[0];
    if (audio) playOrderAlertTone(audio, tone, current.volume, urgent);
  }, []);

  const toggle = useCallback(async () => {
    if (preferencesRef.current.enabled) {
      updatePreferences({ enabled: false });
      return;
    }
    const audio = await getAudioContext();
    const current = preferencesRef.current;
    const tone = tonesRef.current.find(item => item.id === current.toneId) || DEFAULT_ORDER_ALERT_TONES[0];
    playOrderAlertTone(audio, tone, current.volume);
    updatePreferences({ enabled: true });
  }, [getAudioContext, updatePreferences]);

  const preview = useCallback(async (toneId = preferencesRef.current.toneId) => {
    const audio = await getAudioContext();
    const tone = tonesRef.current.find(item => item.id === toneId) || DEFAULT_ORDER_ALERT_TONES[0];
    playOrderAlertTone(audio, tone, preferencesRef.current.volume);
  }, [getAudioContext]);

  const addCustomTone = useCallback((name: string, frequencyText: string) => {
    const cleanName = name.trim();
    const frequencies = parseToneFrequencies(frequencyText);
    if (cleanName.length < 2 || cleanName.length > 40 || !frequencies) {
      throw new Error('Enter a tone name (2-40 characters) and 2-8 frequencies between 250 and 1800 Hz.');
    }
    const tone: OrderAlertTone = {
      id: `custom-${Date.now().toString(36)}`,
      name: cleanName,
      frequencies,
      waveform: 'triangle'
    };
    setCustomTones(current => [...current, tone]);
    tonesRef.current = [...tonesRef.current, tone];
    updatePreferences({ toneId: tone.id });
  }, [updatePreferences]);

  const removeCustomTone = useCallback((toneId: string) => {
    setCustomTones(current => current.filter(tone => tone.id !== toneId));
    tonesRef.current = tonesRef.current.filter(tone => tone.id !== toneId);
    if (preferencesRef.current.toneId === toneId) updatePreferences({ toneId: 'classic' });
  }, [updatePreferences]);

  return {
    enabled: preferences.enabled,
    toneId: selectedTone.id,
    volume: preferences.volume,
    tones,
    play,
    toggle,
    preview,
    setTone: (toneId: string) => {
      if (tones.some(tone => tone.id === toneId)) updatePreferences({ toneId });
    },
    setVolume: (volume: number) => updatePreferences({ volume: Math.min(1, Math.max(0, volume)) }),
    addCustomTone,
    removeCustomTone
  };
}
