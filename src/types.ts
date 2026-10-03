export type AspectRatio = '9:16' | '16:9';

export interface AudioFileRecord {
  id: string;
  name: string;
  size: number;
  duration: number; // in seconds
  url: string; // playable audio url
  uploadedAt: string;
  status: 'idle' | 'uploading' | 'ready' | 'analyzing' | 'complete' | 'error';
  errorMessage?: string;
  uploadId?: string;
}

export interface ChunkUploadStatus {
  uploadId: string;
  uploadedChunks: number[];
  totalChunks: number;
  isComplete: boolean;
}

export interface StockVideoClip {
  id: string;
  source: 'pexels' | 'pixabay' | 'curated';
  title: string;
  duration: number; // duration of source video in seconds
  width: number;
  height: number;
  previewUrl: string; // thumbnail or short preview
  videoUrl: string; // direct mp4 url
  author?: string;
  authorUrl?: string;
}

export interface Scene {
  id: string;
  sceneNumber: number;
  startTime: number; // in seconds
  endTime: number; // in seconds
  duration: number; // in seconds
  transcript: string;
  keywords: string[];
  selectedVideo?: StockVideoClip;
  alternativeVideos: StockVideoClip[];
  isSearching?: boolean;
  searchError?: string;
}

export interface ApiSettings {
  pexelsKey: string;
  pixabayKey: string;
}

export interface RenderResult {
  videoId: string;
  videoUrl: string;
  filename: string;
  duration: number;
  size: number;
  aspectRatio: AspectRatio;
  renderedAt: string;
}

export interface AnalysisProgress {
  stage: 'idle' | 'uploading' | 'transcribing' | 'segmenting' | 'searching' | 'complete' | 'error';
  percent: number;
  message: string;
}
