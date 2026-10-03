import { ApiSettings, AudioFileRecord, RenderResult, Scene, StockVideoClip } from '../types';
import { findCuratedStockVideos } from './fallbackData';

const REQUEST_TIMEOUT_MS = 60000; // 60 seconds

// Safe fetch wrapper with timeout and AbortController
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`);
    }
    throw error;
  }
}

// Robust JSON response parser that handles HTML proxy error pages gracefully
async function parseJsonResponse<T = any>(response: Response, actionDesc: string): Promise<T> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.message || `${actionDesc} failed (HTTP ${response.status})`);
    } else {
      const text = await response.text().catch(() => '');
      const cleanSnippet = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      throw new Error(`${actionDesc} failed (HTTP ${response.status})${cleanSnippet ? `: ${cleanSnippet}` : ''}`);
    }
  }

  if (contentType.includes('application/json')) {
    return await response.json();
  }

  const rawText = await response.text();
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`${actionDesc} received unexpected response format from server.`);
  }
}

// Upload Audio File (Fallback single post)
export async function uploadAudioFile(file: File): Promise<AudioFileRecord> {
  const formData = new FormData();
  formData.append('audio', file);

  const response = await fetchWithTimeout('/api/audio/upload', {
    method: 'POST',
    body: formData,
  }, 120000);

  const data = await parseJsonResponse(response, 'Direct upload');
  return {
    id: data.audioId,
    name: data.filename || file.name,
    size: data.size || file.size,
    duration: data.duration || 0,
    url: data.url,
    uploadedAt: new Date().toISOString(),
    status: 'ready',
  };
}

export interface ChunkUploadProgress {
  percent: number;
  uploadedBytes: number;
  totalBytes: number;
  currentChunk: number;
  totalChunks: number;
  uploadId: string;
}

// Chunked and Resumable Audio Upload (handles 100MB, 200MB, 500MB, 1GB+ with zero browser RAM bloat)
export async function uploadAudioInChunks(
  file: File,
  options: {
    uploadId?: string;
    onProgress?: (progress: ChunkUploadProgress) => void;
    signal?: AbortSignal;
  } = {}
): Promise<AudioFileRecord> {
  // Use 5MB chunk slices: resilient across all reverse-proxies, cloud load balancers, and mobile connections
  const CHUNK_SIZE = 5 * 1024 * 1024;
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  let uploadId = options.uploadId;
  let uploadedChunksSet = new Set<number>();

  // If resuming with an existing uploadId, check server for previously uploaded chunks
  if (uploadId) {
    try {
      const statusResp = await fetch(`/api/audio/upload/status/${encodeURIComponent(uploadId)}`, { signal: options.signal });
      if (statusResp.ok) {
        const statusData = await parseJsonResponse(statusResp, 'Upload status check');
        if (Array.isArray(statusData.uploadedChunks)) {
          uploadedChunksSet = new Set(statusData.uploadedChunks);
        }
      } else {
        uploadId = undefined; // Session expired, start fresh
      }
    } catch {
      uploadId = undefined;
    }
  }

  // Initialize upload session if needed
  if (!uploadId) {
    const initResp = await fetch('/api/audio/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        fileSize: file.size,
        totalChunks,
        mimeType: file.type || 'audio/mpeg',
      }),
      signal: options.signal,
    });

    const initData = await parseJsonResponse(initResp, 'Upload initialization');
    uploadId = initData.uploadId;
    if (Array.isArray(initData.uploadedChunks)) {
      uploadedChunksSet = new Set(initData.uploadedChunks);
    }
  }

  // Calculate already uploaded bytes from prior chunks
  let uploadedBytes = 0;
  for (let c = 0; c < totalChunks; c++) {
    if (uploadedChunksSet.has(c)) {
      const start = c * CHUNK_SIZE;
      const end = Math.min(file.size, (c + 1) * CHUNK_SIZE);
      uploadedBytes += (end - start);
    }
  }

  // Upload each chunk slice sequentially
  for (let i = 0; i < totalChunks; i++) {
    if (options.signal?.aborted) {
      throw new Error('Upload cancelled');
    }

    // Skip chunk if already stored on server (Resumable!)
    if (uploadedChunksSet.has(i)) {
      continue;
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, (i + 1) * CHUNK_SIZE);
    // file.slice only slices a 5MB blob without loading the full file into memory
    const chunkBlob = file.slice(start, end);

    let chunkSuccess = false;
    let lastError: Error | null = null;

    // Retry up to 3 times per chunk for network resilience
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (options.signal?.aborted) throw new Error('Upload cancelled');

      try {
        const formData = new FormData();
        formData.append('uploadId', uploadId!);
        formData.append('chunkIndex', String(i));
        formData.append('totalChunks', String(totalChunks));
        formData.append('chunk', chunkBlob, `chunk_${i}.bin`);

        // Send metadata via query parameters as well to eliminate CORS preflight header friction
        const chunkUrl = `/api/audio/upload/chunk?uploadId=${encodeURIComponent(uploadId!)}&chunkIndex=${i}&totalChunks=${totalChunks}`;
        const chunkResp = await fetch(chunkUrl, {
          method: 'POST',
          body: formData,
          signal: options.signal,
        });

        await parseJsonResponse(chunkResp, `Chunk ${i + 1}/${totalChunks}`);

        chunkSuccess = true;
        uploadedChunksSet.add(i);
        uploadedBytes += (end - start);

        if (options.onProgress) {
          const percent = Math.min(99, Math.round((uploadedBytes / file.size) * 100));
          options.onProgress({
            percent,
            uploadedBytes,
            totalBytes: file.size,
            currentChunk: i + 1,
            totalChunks,
            uploadId: uploadId!,
          });
        }
        break;
      } catch (err: any) {
        lastError = err;
        if (options.signal?.aborted) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    if (!chunkSuccess) {
      throw lastError || new Error(`Failed to upload chunk ${i + 1} of ${totalChunks}.`);
    }
  }

  // Complete assembly on the server
  const completeResp = await fetch('/api/audio/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
    signal: options.signal,
  });

  const completeData = await parseJsonResponse(completeResp, 'Audio assembly');

  if (options.onProgress) {
    options.onProgress({
      percent: 100,
      uploadedBytes: file.size,
      totalBytes: file.size,
      currentChunk: totalChunks,
      totalChunks,
      uploadId: uploadId!,
    });
  }

  return {
    id: completeData.audioId,
    name: completeData.filename || file.name,
    size: completeData.size || file.size,
    duration: completeData.duration || 0,
    url: completeData.url,
    uploadedAt: new Date().toISOString(),
    status: 'ready',
    uploadId: uploadId,
  };
}

export async function cancelAudioUpload(uploadId: string): Promise<void> {
  try {
    await fetch('/api/audio/upload/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });
  } catch {}
}

export function formatTimeLong(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

// Client-side accurate duration detection using HTML Audio and Web Audio API
export async function detectAudioDuration(fileOrUrl: File | string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      const url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
      
      const cleanUp = () => {
        if (typeof fileOrUrl !== 'string') {
          URL.revokeObjectURL(url);
        }
      };

      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        cleanUp();
        if (d && !isNaN(d) && isFinite(d) && d > 0) {
          resolve(Math.round(d * 100) / 100);
        } else {
          resolve(0);
        }
      };

      audio.onerror = () => {
        cleanUp();
        resolve(0);
      };

      // Timeout fallback
      setTimeout(() => {
        cleanUp();
        resolve(0);
      }, 5000);

      audio.src = url;
    } catch {
      resolve(0);
    }
  });
}

// Analyze Audio
export async function analyzeAudio(
  audioId: string,
  totalDuration: number,
  transcriptHint?: string
): Promise<{ scenes: Scene[]; message?: string }> {
  const response = await fetchWithTimeout('/api/audio/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioId, totalDuration, transcriptHint }),
  }, 60000);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Analysis failed with HTTP ${response.status}`);
  }

  return response.json();
}

// Search Stock Videos (Pexels + Pixabay)
export async function searchStockVideos(
  query: string,
  orientation: 'portrait' | 'landscape',
  settings: ApiSettings
): Promise<{ videos: StockVideoClip[]; pexelsWarning?: string; pixabayWarning?: string }> {
  try {
    const response = await fetchWithTimeout('/api/stock/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        orientation,
        pexelsKey: settings.pexelsKey,
        pixabayKey: settings.pixabayKey,
      }),
    }, 15000);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Search failed with status ${response.status}`);
    }

    const data = await response.json();
    let videos: StockVideoClip[] = data.videos || [];

    // If no videos returned or keys unconfigured, backfill with curated clips
    if (videos.length === 0) {
      videos = findCuratedStockVideos([query]);
    }

    return {
      videos,
      pexelsWarning: data.pexelsWarning,
      pixabayWarning: data.pixabayWarning,
    };
  } catch (error: any) {
    // Graceful fallback to curated
    const fallback = findCuratedStockVideos([query]);
    return {
      videos: fallback,
      pexelsWarning: error.message || 'Error reaching video search proxy',
    };
  }
}

// Test API Keys
export async function testApiKeys(settings: ApiSettings): Promise<{
  pexels: { ok: boolean; message: string };
  pixabay: { ok: boolean; message: string };
}> {
  const response = await fetchWithTimeout('/api/stock/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pexelsKey: settings.pexelsKey,
      pixabayKey: settings.pixabayKey,
    }),
  }, 12000);

  if (!response.ok) {
    throw new Error(`Testing keys failed with HTTP ${response.status}`);
  }

  return response.json();
}

// Trim / Download Single Clip
export async function trimSingleClip(
  videoUrl: string,
  duration: number,
  orientation: '9:16' | '16:9'
): Promise<{ clipUrl: string; filename: string }> {
  const response = await fetchWithTimeout('/api/video/trim-clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, duration, orientation }),
  }, 45000);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to trim clip');
  }

  return response.json();
}

// Render Final Video with voiceover and transitions
export async function renderFinalVideo(
  audioId: string,
  scenes: Scene[],
  aspectRatio: '9:16' | '16:9',
  transitionDuration: number = 0.4
): Promise<RenderResult> {
  const payload = {
    audioId,
    scenes: scenes.map(s => ({
      id: s.id,
      sceneNumber: s.sceneNumber,
      startTime: s.startTime,
      endTime: s.endTime,
      duration: s.duration,
      videoUrl: s.selectedVideo?.videoUrl || '',
    })),
    aspectRatio,
    transitionDuration,
  };

  const response = await fetchWithTimeout('/api/video/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 120000); // 2 min max for video processing

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Render failed with HTTP ${response.status}`);
  }

  return response.json();
}

// LocalStorage helpers for session persistence
const STORAGE_KEY_AUDIO = 'v2v_uploaded_audio';
const STORAGE_KEY_SCENES = 'v2v_project_scenes';
const STORAGE_KEY_SETTINGS = 'v2v_api_settings';

export function saveAudioToStorage(audio: AudioFileRecord | null) {
  try {
    if (!audio) {
      localStorage.removeItem(STORAGE_KEY_AUDIO);
    } else {
      localStorage.setItem(STORAGE_KEY_AUDIO, JSON.stringify(audio));
    }
  } catch {}
}

export function loadAudioFromStorage(): AudioFileRecord | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY_AUDIO);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export function saveScenesToStorage(scenes: Scene[]) {
  try {
    localStorage.setItem(STORAGE_KEY_SCENES, JSON.stringify(scenes));
  } catch {}
}

export function loadScenesFromStorage(): Scene[] {
  try {
    const val = localStorage.getItem(STORAGE_KEY_SCENES);
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
}

export function saveSettingsToStorage(settings: ApiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch {}
}

export function loadSettingsFromStorage(): ApiSettings {
  try {
    const val = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (val) return JSON.parse(val);
  } catch {}
  return {
    pexelsKey: '',
    pixabayKey: '57022940-afa0a84bdee17afc2e3013778', // pre-filled from user brief
  };
}
