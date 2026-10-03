import React, { useRef, useState, useEffect } from 'react';
import { AudioFileRecord, AnalysisProgress } from '../types';
import {
  uploadAudioInChunks,
  cancelAudioUpload,
  detectAudioDuration,
  formatTimeLong,
  formatBytes,
  ChunkUploadProgress,
} from '../services/api';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileAudio,
  Play,
  RotateCcw,
  Sparkles,
  HelpCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';

interface AudioUploaderProps {
  audio: AudioFileRecord | null;
  onAudioUploaded: (audio: AudioFileRecord) => void;
  onAnalyze: (transcriptHint?: string) => void;
  onReset: () => void;
  isAnalyzing: boolean;
  analysisProgress: AnalysisProgress;
  hasAnalyzedScenes: boolean;
}

export const AudioUploader: React.FC<AudioUploaderProps> = ({
  audio,
  onAudioUploaded,
  onAnalyze,
  onReset,
  isAnalyzing,
  analysisProgress,
  hasAnalyzedScenes,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Local pending file before or during upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number>(0);
  const [activeUploadId, setActiveUploadId] = useState<string | undefined>(undefined);

  const [isUploading, setIsUploading] = useState(false);
  const [chunkProgress, setChunkProgress] = useState<ChunkUploadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcriptHint, setTranscriptHint] = useState('');
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  // Clear errors when audio state changes
  useEffect(() => {
    if (audio && (audio.status === 'ready' || audio.status === 'complete')) {
      setErrorMessage(null);
      setSelectedFile(null);
    }
  }, [audio]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-selecting same file triggers onChange
    e.target.value = '';

    await handleSelectFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleSelectFile(file);
    }
  };

  const handleSelectFile = async (file: File) => {
    setErrorMessage(null);

    // Validate supported formats
    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm', '.wma'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    const isAudioMime = file.type.startsWith('audio/') || file.type.includes('mpeg') || file.type.includes('wav');

    if (!hasValidExt && !isAudioMime) {
      setErrorMessage(
        `Unsupported audio format (${file.name}). Please select an MP3, WAV, M4A, AAC, or FLAC file.`
      );
      return;
    }

    // Keep file reference for chunked upload
    setSelectedFile(file);
    setChunkProgress(null);
    setActiveUploadId(undefined);

    // Fast header read of audio duration without loading file into memory
    const duration = await detectAudioDuration(file);
    setFileDuration(duration);

    // Automatically begin chunked upload
    await startChunkedUpload(file);
  };

  const startChunkedUpload = async (file: File, resumeUploadId?: string) => {
    setIsUploading(true);
    setErrorMessage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const record = await uploadAudioInChunks(file, {
        uploadId: resumeUploadId || activeUploadId,
        signal: controller.signal,
        onProgress: (p) => {
          setChunkProgress(p);
          setActiveUploadId(p.uploadId);
        },
      });

      // Upload finished successfully
      if (!record.duration && fileDuration > 0) {
        record.duration = fileDuration;
      }
      onAudioUploaded(record);
      setSelectedFile(null);
      setActiveUploadId(undefined);
    } catch (err: any) {
      if (err.message === 'Upload cancelled' || controller.signal.aborted) {
        setErrorMessage('Upload was cancelled.');
      } else {
        console.error('Upload error:', err);
        setErrorMessage(
          err.message || 'Network interruption during upload. You can click Retry to resume from where you left off.'
        );
      }
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelUpload = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (activeUploadId) {
      await cancelAudioUpload(activeUploadId);
    }
    setIsUploading(false);
    setChunkProgress(null);
    setActiveUploadId(undefined);
    setSelectedFile(null);
    setErrorMessage('Upload cancelled.');
  };

  const handleRetryUpload = async () => {
    if (selectedFile) {
      await startChunkedUpload(selectedFile, activeUploadId);
    }
  };

  const handleLoadSample = async (preset: string) => {
    setIsLoadingSample(true);
    setErrorMessage(null);
    try {
      const resp = await fetch(`/api/audio/sample/${preset}`);
      if (!resp.ok) throw new Error('Failed to load sample voiceover');
      const data = await resp.json();

      const record: AudioFileRecord = {
        id: data.audioId,
        name: data.filename,
        size: data.size,
        duration: data.duration,
        url: data.url,
        uploadedAt: new Date().toISOString(),
        status: 'ready',
      };
      onAudioUploaded(record);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading sample voiceover');
    } finally {
      setIsLoadingSample(false);
    }
  };

  const isAudioReady = audio && (audio.status === 'ready' || audio.status === 'complete');
  const canAnalyze = isAudioReady && !isUploading && !isAnalyzing;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/30">
              1
            </span>
            <span>Upload Voiceover Audio</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Supports MP3, WAV, M4A, AAC, and FLAC voiceovers of any length (including 1 hr, 2 hrs+).
          </p>
        </div>

        {/* 1-Click Samples for Instant Testing */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden md:inline">Or try sample:</span>
          <button
            type="button"
            onClick={() => handleLoadSample('fitness')}
            disabled={isLoadingSample || isUploading || isAnalyzing}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white rounded-lg border border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-all disabled:opacity-50"
            title="Elderly Fitness Voiceover (31s, 4 scenes)"
          >
            {isLoadingSample ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
            <span>Sample (31s)</span>
          </button>
        </div>
      </div>

      {/* Hidden Proper HTML File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Initial Select Area (When no file selected yet and no audio ready) */}
      {!audio && !selectedFile && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 bg-slate-900/50 hover:bg-slate-800/40 rounded-xl p-8 text-center cursor-pointer transition-all group"
        >
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 group-hover:bg-indigo-600/20 text-indigo-400 mx-auto flex items-center justify-center transition-colors mb-3">
            <Upload className="w-7 h-7" />
          </div>
          <p className="text-sm font-medium text-slate-200 group-hover:text-white">
            Click to choose a voiceover audio file or drag & drop here
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Supports MP3, WAV, M4A, AAC, FLAC (100MB, 200MB, 500MB, 1GB+)
          </p>
        </div>
      )}

      {/* Uploading or Selected File Card */}
      {selectedFile && !isAudioReady && (
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
                <FileAudio className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate max-w-sm sm:max-w-md">
                  {selectedFile.name}
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                  <span>File size: <strong className="text-slate-200">{formatBytes(selectedFile.size)}</strong></span>
                  {fileDuration > 0 && (
                    <>
                      <span>•</span>
                      <span>Audio duration: <strong className="text-slate-200">{formatTimeLong(fileDuration)}</strong></span>
                    </>
                  )}
                  <span>•</span>
                  <span className="text-indigo-400 font-medium">
                    {isUploading ? 'Chunked Streaming Upload...' : 'Ready to upload'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons during upload */}
            <div className="flex items-center gap-2">
              {isUploading ? (
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 rounded-lg border border-rose-500/30 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancel Upload</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startChunkedUpload(selectedFile)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md inline-flex items-center gap-1.5 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Audio</span>
                </button>
              )}
            </div>
          </div>

          {/* Real Chunk Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-2 pt-2 border-t border-slate-700/60">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>
                    Uploading chunk {chunkProgress?.currentChunk || 1} of {chunkProgress?.totalChunks || 1} ({formatBytes(chunkProgress?.uploadedBytes || 0)} / {formatBytes(selectedFile.size)})
                  </span>
                </span>
                <span className="font-mono font-bold text-indigo-400">
                  {chunkProgress?.percent || 0}%
                </span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${chunkProgress?.percent || 5}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Uploaded safely in 15 MB chunks. Never loads entire file into browser memory.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Completed Ready Audio Card */}
      {isAudioReady && (
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 sm:p-5 space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <FileAudio className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white truncate max-w-[280px] sm:max-w-md">
                    {audio.name}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    Uploaded successfully
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                  <span>File size: <strong className="text-slate-200">{formatBytes(audio.size)}</strong></span>
                  <span>•</span>
                  <span>Audio duration: <strong className="text-slate-200">{formatTimeLong(audio.duration)}</strong></span>
                </div>
              </div>
            </div>

            {/* Replace Audio Button */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isAnalyzing}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Replace Audio</span>
              </button>
            </div>
          </div>

          {/* HTML5 Audio Player */}
          <div className="pt-2 border-t border-slate-700/60">
            <label className="text-xs font-medium text-slate-400 block mb-1.5">
              Audio Player Preview:
            </label>
            <audio
              controls
              src={audio.url}
              className="w-full h-10 rounded-lg bg-slate-900 border border-slate-700"
              preload="metadata"
            />
          </div>
        </div>
      )}

      {/* Analysis Progress / Stages */}
      {isAnalyzing && (
        <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-medium text-indigo-300">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>{analysisProgress.message || 'Analyzing voiceover timeline & scene concepts...'}</span>
            </span>
            <span>{analysisProgress.percent}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${analysisProgress.percent}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Processing audio in sequential chunks to preserve continuous timestamps across the entire timeline.
          </p>
        </div>
      )}

      {/* Error Message with Resumable Retry button */}
      {errorMessage && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start justify-between gap-3 text-xs text-rose-300 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Upload / Processing Notice:</p>
              <p className="mt-0.5 text-rose-300/90">{errorMessage}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selectedFile && !isUploading && (
              <button
                type="button"
                onClick={handleRetryUpload}
                className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-md font-medium inline-flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry Upload</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white px-1.5 py-1 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Optional Transcript Input for 100% Free / Manual Fallback */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowTranscriptInput(!showTranscriptInput)}
          className="text-xs text-slate-400 hover:text-indigo-400 inline-flex items-center gap-1.5 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>{showTranscriptInput ? 'Hide transcript helper' : 'Have a transcript or specific scene notes? (Optional)'}</span>
        </button>

        {showTranscriptInput && (
          <div className="mt-2.5 p-3.5 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-2 animate-in fade-in">
            <label className="text-xs text-slate-300 block">
              Paste your voiceover script / keywords here (optional):
            </label>
            <textarea
              rows={2}
              value={transcriptHint}
              onChange={(e) => setTranscriptHint(e.target.value)}
              placeholder="e.g. 0:00 elderly man walking, 0:05 leg exercise, 0:15 healthy breakfast, 0:17 elderly woman exercising"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-slate-500">
              The analyzer will align these topics directly with your voiceover timeline.
            </p>
          </div>
        )}
      </div>

      {/* Analyze Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <p className="text-xs text-slate-400">
          {hasAnalyzedScenes
            ? '✓ Scenes segmented. You can re-analyze or review the matched clips below.'
            : isAudioReady
            ? 'Audio is uploaded and ready. Click Analyze to create your scene timeline.'
            : 'Select and upload an audio file to begin analysis.'}
        </p>

        <button
          type="button"
          onClick={() => onAnalyze(transcriptHint)}
          disabled={!canAnalyze}
          className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-medium text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg transition-all ${
            canAnalyze
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/20 active:scale-[0.98]'
              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
          }`}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing Voiceover...</span>
            </>
          ) : hasAnalyzedScenes ? (
            <>
              <RotateCcw className="w-4 h-4" />
              <span>Re-Analyze Voiceover</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Analyze Voiceover</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
