import { describe, it, expect, vi, afterEach } from 'vitest';
import { TtsApiService } from './tts-api.service';
import { normalizeServerUrl } from './tts-settings.service';

const json = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

describe('normalizeServerUrl', () => {
  it('adds a scheme and strips trailing slashes', () => {
    expect(normalizeServerUrl(' localhost:8000/ ')).toBe('http://localhost:8000');
    expect(normalizeServerUrl('https://tts.lan/')).toBe('https://tts.lan');
    expect(normalizeServerUrl('')).toBe('');
  });
});

describe('TtsApiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports models and voices on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/health')
          ? json({})
          : json({ data: [{ id: 'kokoro', voices: [{ name: 'af_heart' }, 'am_adam'] }] }),
      ),
    );
    const r = await new TtsApiService().testConnection('localhost:8000');
    expect(r.ok).toBe(true);
    expect(r.models).toEqual(['kokoro']);
    expect(r.voicesByModel['kokoro'].map((v) => v.id)).toEqual(['af_heart', 'am_adam']);
  });

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const r = await new TtsApiService().testConnection('http://localhost:1');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/could not reach/i);
  });

  it('posts the speech request', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    await new TtsApiService().synthesize('http://h:8000/', { model: 'm', voice: 'v', speed: 1.2, input: 'Hi.' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://h:8000/v1/audio/speech');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'm', voice: 'v', speed: 1.2, input: 'Hi.' });
  });
});
