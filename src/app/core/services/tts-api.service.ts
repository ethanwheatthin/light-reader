import { Injectable } from '@angular/core';
import { normalizeServerUrl } from './tts-settings.service';

export interface TtsVoice {
  id: string;
  language?: string;
  gender?: string;
}

export interface TtsConnectionResult {
  ok: boolean;
  message: string;
  models: string[];
  voicesByModel: Record<string, TtsVoice[]>;
}

export interface TtsSynthesisRequest {
  model: string;
  voice: string;
  speed: number;
  input: string;
}

/** Talks to a Speaches server (OpenAI-compatible audio API) directly from the browser. */
@Injectable({ providedIn: 'root' })
export class TtsApiService {
  async testConnection(rawUrl: string): Promise<TtsConnectionResult> {
    const base = normalizeServerUrl(rawUrl);
    const result: TtsConnectionResult = { ok: false, message: '', models: [], voicesByModel: {} };
    if (!base) {
      result.message = 'Enter a server URL first.';
      return result;
    }

    let healthOk = false;
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      healthOk = res.ok;
    } catch (e) {
      result.message =
        'Could not reach the server. Check the URL, that Speaches is running, and that CORS is enabled.';
      return result;
    }

    try {
      const res = await fetch(`${base}/v1/models?task=text-to-speech`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      for (const m of body?.data ?? []) {
        if (typeof m?.id !== 'string') continue;
        result.models.push(m.id);
        const voices: TtsVoice[] = [];
        for (const v of m.voices ?? []) {
          const id = typeof v === 'string' ? v : (v?.id ?? v?.name);
          if (typeof id !== 'string') continue;
          voices.push({
            id,
            language: typeof v?.language === 'string' ? v.language : undefined,
            gender: typeof v?.gender === 'string' ? v.gender : undefined,
          });
        }
        if (voices.length) result.voicesByModel[m.id] = voices;
      }
      result.ok = true;
      result.message = result.models.length
        ? `Connected. ${result.models.length} text-to-speech model(s) available.`
        : 'Connected, but no text-to-speech models are installed on the server.';
    } catch (e) {
      result.ok = healthOk;
      result.message = healthOk
        ? 'Connected, but could not list models.'
        : 'The server responded but does not look like a Speaches server.';
    }
    return result;
  }

  async synthesize(
    rawUrl: string,
    req: TtsSynthesisRequest,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const base = normalizeServerUrl(rawUrl);
    const res = await fetch(`${base}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        voice: req.voice,
        input: req.input,
        speed: req.speed,
        response_format: 'mp3',
      }),
      signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`TTS server returned ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return res.blob();
  }
}
