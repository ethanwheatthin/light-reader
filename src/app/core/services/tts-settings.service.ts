import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'tts-settings';

export const TTS_SPEED_MIN = 0.5;
export const TTS_SPEED_MAX = 2;
export const TTS_SPEED_STEP = 0.1;

/** Normalize user input like "localhost:8000/" to "http://localhost:8000". */
export function normalizeServerUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

/** Persisted settings for the Speaches (OpenAI-compatible) text-to-speech server. */
@Injectable({ providedIn: 'root' })
export class TtsSettingsService {
  serverUrl = signal<string>('http://localhost:4200/tts-proxy');
  model = signal<string>('speaches-ai/Kokoro-82M-v1.0-ONNX');
  voice = signal<string>('af_heart');
  speed = signal<number>(1);

  constructor() {
    this.load();
  }

  save(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          serverUrl: this.serverUrl(),
          model: this.model(),
          voice: this.voice(),
          speed: this.speed(),
        }),
      );
    } catch {
      console.warn('Could not persist TTS settings');
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.serverUrl === 'string') this.serverUrl.set(saved.serverUrl);
      if (typeof saved.model === 'string' && saved.model) this.model.set(saved.model);
      if (typeof saved.voice === 'string' && saved.voice) this.voice.set(saved.voice);
      if (typeof saved.speed === 'number') this.speed.set(saved.speed);
    } catch {
      console.warn('Could not load TTS settings');
    }
  }
}
