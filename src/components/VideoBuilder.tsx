import React, { useState, useRef, useEffect } from 'react';
import { Scene, AspectRatio, RenderResult, AudioFileRecord } from '../types';
import { renderFinalVideo } from '../services/api';
import {
  Play,
  Pause,
  Download,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Film,
  RefreshCw,
  Maximize2,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface VideoBuilderProps {
  audio: AudioFileRecord;
  scenes: Scene[];
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
}

export const VideoBuilder: React.FC<VideoBuilderProps> = ({
  audio,
  scenes,
  aspectRatio,
  onAspectRatioChange,
}) => {
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgressStage, setRenderProgressStage] = useState('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);

  // Synchronized Interactive In-Browser Preview
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const totalDuration = audio.duration || 30;

  // Determine current scene based on preview time
  const currentScene = scenes.find(
    (s) => previewTime >= s.startTime && previewTime < s.endTime
  ) || scenes[0];

  // Update synchronized preview time
  const updatePreviewTick = () => {
    if (audioRef.current && !audioRef.current.paused) {
      const cur = audioRef.current.currentTime;
      setPreviewTime(cur);

      if (cur >= totalDuration) {
        setIsPlayingPreview(false);
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setPreviewTime(0);
        return;
      }
      animationFrameRef.current = requestAnimationFrame(updatePreviewTick);
    }
  };

  const togglePreviewPlay = () => {
    if (!audioRef.current) return;

    if (isPlayingPreview) {
      audioRef.current.pause();
      setIsPlayingPreview(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingPreview(true);
        animationFrameRef.current = requestAnimationFrame(updatePreviewTick);
      }).catch((e) => console.warn('Preview play error:', e));
    }
  };

  // Sync video element when currentScene changes during preview
  useEffect(() => {
    if (videoRef.current && currentScene?.selectedVideo?.videoUrl) {
      const vid = videoRef.current;
      const sceneOffset = Math.max(0, previewTime - currentScene.startTime);
      // Only seek if difference is large to avoid stutter
      if (Math.abs(vid.currentTime - sceneOffset) > 0.5) {
        vid.currentTime = sceneOffset;
      }
      if (isPlayingPreview && vid.paused) {
        vid.play().catch(() => {});
      }
    }
  }, [currentScene, previewTime, isPlayingPreview]);

  // Clean up animation frames
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Handle Full FFmpeg Render
  const handleRenderVideo = async () => {
    const missingVideo = scenes.find((s) => !s.selectedVideo?.videoUrl);
    if (missingVideo) {
      setRenderError(`Scene ${missingVideo.sceneNumber} does not have a video selected.`);
      return;
    }

    setIsRendering(true);
    setRenderError(null);
    setRenderProgressStage('Downloading source stock clips to server...');

    try {
      // Stage updates
      const t1 = setTimeout(() => setRenderProgressStage('Trimming and cropping clips to exact scene timing...'), 4000);
      const t2 = setTimeout(() => setRenderProgressStage('Applying smooth transitions and concatenating video stream...'), 10000);
      const t3 = setTimeout(() => setRenderProgressStage('Muxing original voiceover audio track into final MP4...'), 16000);

      const result = await renderFinalVideo(audio.id, scenes, aspectRatio, 0.4);

      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      setRenderResult(result);
    } catch (err: any) {
      console.error('Video render error:', err);
      setRenderError(err.message || 'Failed to render video. Please try again.');
    } finally {
      setIsRendering(false);
      setRenderProgressStage('');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1000) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    if (hrs > 0 || totalDuration >= 3600) {
      return `${hrs.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/30">
              4 & 5
            </span>
            <span>Build, Preview & Download Final Video</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Visual scenes are locked to your voiceover timeline. Smooth crossfade transitions with original audio.
          </p>
        </div>

        {/* Orientation selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Format:</span>
          <button
            type="button"
            onClick={() => onAspectRatioChange('9:16')}
            className={`px-3 py-1 rounded-lg text-xs font-medium border ${
              aspectRatio === '9:16'
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            9:16 Vertical
          </button>
          <button
            type="button"
            onClick={() => onAspectRatioChange('16:9')}
            className={`px-3 py-1 rounded-lg text-xs font-medium border ${
              aspectRatio === '16:9'
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            16:9 Landscape
          </button>
        </div>
      </div>

      {/* Synchronized Player Preview Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Preview Canvas / Player */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Film className="w-4 h-4 text-indigo-400" />
              <span>Interactive Synchronized Preview</span>
            </span>
            <span className="text-xs font-mono text-indigo-300">
              {formatTime(previewTime)} / {formatTime(totalDuration)}
            </span>
          </div>

          {/* Video Container (Strictly follows Aspect Ratio) */}
          <div
            className={`relative rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl mx-auto flex items-center justify-center ${
              aspectRatio === '9:16' ? 'aspect-[9/16] max-h-[460px]' : 'aspect-video'
            }`}
          >
            {currentScene?.selectedVideo ? (
              <video
                ref={videoRef}
                src={currentScene.selectedVideo.videoUrl}
                playsInline
                muted
                loop
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-slate-500 text-xs flex flex-col items-center gap-2">
                <Film className="w-8 h-8 opacity-40" />
                <span>Select a video for Scene {currentScene?.sceneNumber || 1}</span>
              </div>
            )}

            {/* Overlaid Scene Badge (No subtitles on final video, this is only for preview timeline reference) */}
            <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] text-white font-mono border border-white/10 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Scene #{currentScene?.sceneNumber}</span>
              <span className="opacity-60 text-[10px]">
                ({currentScene?.startTime.toFixed(1)}s - {currentScene?.endTime.toFixed(1)}s)
              </span>
            </div>

            {/* Hidden Voiceover Audio Source for Preview Sync */}
            <audio
              ref={audioRef}
              src={audio.url}
              muted={isMuted}
              preload="auto"
              onEnded={() => {
                setIsPlayingPreview(false);
                setPreviewTime(0);
              }}
            />
          </div>

          {/* Preview Scrubber & Controls */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 space-y-2">
            <input
              type="range"
              min="0"
              max={totalDuration || 1}
              step="0.1"
              value={previewTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setPreviewTime(val);
                if (audioRef.current) {
                  audioRef.current.currentTime = val;
                }
              }}
              className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePreviewPlay}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-sm transition-colors"
                  title={isPlayingPreview ? 'Pause' : 'Play'}
                >
                  {isPlayingPreview ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 text-slate-400 hover:text-white bg-slate-700/60 rounded-lg transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              <span className="text-xs text-slate-400">
                Playing Scene #{currentScene?.sceneNumber}: "{currentScene?.keywords[0] || 'visual'}"
              </span>
            </div>
          </div>
        </div>

        {/* FFmpeg Final Video Rendering & Download Controls */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-6 bg-slate-850/60 border border-slate-800 rounded-2xl p-5">
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-white">Final Video Compiler</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Generates a single MP4 with FFmpeg: exact scene trimming, intelligent center-crop, continuous voiceover audio, and smooth crossfades.
              </p>
            </div>

            {/* Render Checklist */}
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Audio Track: <strong>{audio.name}</strong> ({totalDuration.toFixed(1)}s)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Scenes Arranged: <strong>{scenes.length}</strong> sequential clips</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Aspect Ratio: <strong>{aspectRatio === '9:16' ? '9:16 (720x1280)' : '16:9 (1280x720)'}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Captions/Subtitles: <strong>None</strong> (Clean video)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Transitions: <strong>0.4s Smooth Crossfade</strong></span>
              </div>
            </div>

            {/* Error Message */}
            {renderError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{renderError}</span>
              </div>
            )}

            {/* Active Render Progress */}
            {isRendering && (
              <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Processing Video with FFmpeg...</span>
                </div>
                <p className="text-xs text-slate-300">{renderProgressStage}</p>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full animate-pulse w-full" />
                </div>
              </div>
            )}

            {/* Completed Render Result Box */}
            {renderResult && !isRendering && (
              <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Final Video Ready!</span>
                </div>
                <div className="text-xs text-slate-300 space-y-1">
                  <p>Duration: <strong className="text-white">{renderResult.duration.toFixed(1)}s</strong> (matches voiceover)</p>
                  <p>File Size: <strong className="text-white">{formatFileSize(renderResult.size)}</strong></p>
                  <p>Format: <strong className="text-white">{renderResult.aspectRatio} MP4</strong></p>
                </div>

                <a
                  href={renderResult.videoUrl}
                  download={renderResult.filename}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Final Video (.mp4)</span>
                </a>
              </div>
            )}
          </div>

          {/* Primary Render Button */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleRenderVideo}
              disabled={isRendering || scenes.length === 0}
              className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
                isRendering
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : renderResult
                  ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-600/30'
              }`}
            >
              {isRendering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rendering Final Video...</span>
                </>
              ) : renderResult ? (
                <>
                  <RefreshCw className="w-4 h-4 text-indigo-400" />
                  <span>Re-Render Final Video</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Render Final Video (FFmpeg)</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-500 text-center">
              Uses system FFmpeg to trim, scale, crossfade, and mux the audio track without quality loss.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
