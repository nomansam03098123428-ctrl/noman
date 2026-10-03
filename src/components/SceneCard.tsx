import React, { useState } from 'react';
import { Scene, StockVideoClip, AspectRatio } from '../types';
import { trimSingleClip } from '../services/api';
import {
  Film,
  Download,
  Search,
  Check,
  RotateCw,
  ExternalLink,
  Loader2,
  Play,
  Volume2,
  VolumeX,
  AlertCircle,
  Tag,
} from 'lucide-react';

interface SceneCardProps {
  scene: Scene;
  aspectRatio: AspectRatio;
  onSelectVideo: (sceneId: string, video: StockVideoClip) => void;
  onSearchVideos: (sceneId: string, customQuery?: string) => void;
  onUpdateKeywords: (sceneId: string, keywords: string[]) => void;
  onUpdateTranscript: (sceneId: string, transcript: string) => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  aspectRatio,
  onSelectVideo,
  onSearchVideos,
  onUpdateKeywords,
  onUpdateTranscript,
}) => {
  const [isDownloadingClip, setIsDownloadingClip] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [customQuery, setCustomQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState(scene.transcript);
  const [newKeyword, setNewKeyword] = useState('');

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    if (hrs > 0 || scene.endTime >= 3600) {
      return `${hrs.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const handleDownloadClip = async () => {
    if (!scene.selectedVideo?.videoUrl) {
      setDownloadError('No video selected for this scene.');
      return;
    }

    setIsDownloadingClip(true);
    setDownloadError(null);

    try {
      const res = await trimSingleClip(scene.selectedVideo.videoUrl, scene.duration, aspectRatio);
      // Trigger browser download
      const a = document.createElement('a');
      a.href = res.clipUrl;
      a.download = `scene_${scene.sceneNumber}_${scene.duration}s_${aspectRatio.replace(':', 'x')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download trimmed clip.');
    } finally {
      setIsDownloadingClip(false);
    }
  };

  const handleCustomSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customQuery.trim()) {
      onSearchVideos(scene.id, customQuery.trim());
      setShowSearchInput(false);
    }
  };

  const handleAddKeyword = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newKeyword.trim()) {
      e.preventDefault();
      const updated = Array.from(new Set([...scene.keywords, newKeyword.trim().toLowerCase()]));
      onUpdateKeywords(scene.id, updated);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    const updated = scene.keywords.filter((kw) => kw !== keywordToRemove);
    onUpdateKeywords(scene.id, updated);
  };

  const handleSaveTranscript = () => {
    onUpdateTranscript(scene.id, editedTranscript);
    setIsEditingText(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl transition-all hover:border-slate-700">
      {/* Card Header */}
      <div className="px-5 py-4 bg-slate-850 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md shadow-indigo-600/30">
            #{scene.sceneNumber}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white">
                {formatTime(scene.startTime)} - {formatTime(scene.endTime)}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Duration: {scene.duration.toFixed(1)}s
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Exact voiceover segment timing
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Replace / Search Button */}
          <button
            type="button"
            onClick={() => setShowSearchInput(!showSearchInput)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-indigo-400" />
            <span>Replace / Search</span>
          </button>

          {/* Download Individual Clip Button */}
          <button
            type="button"
            onClick={handleDownloadClip}
            disabled={isDownloadingClip || !scene.selectedVideo}
            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white rounded-lg border border-indigo-500/30 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Download trimmed & cropped video clip for this scene"
          >
            {isDownloadingClip ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Download Clip</span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Custom Query Search Drawer */}
        {showSearchInput && (
          <form onSubmit={handleCustomSearchSubmit} className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 flex gap-2 animate-in fade-in">
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="Search specific visual (e.g. elderly man smiling, walking in park)..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
            >
              Search
            </button>
          </form>
        )}

        {/* Spoken Transcript */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
              Spoken Transcript:
            </span>
            {!isEditingText ? (
              <button
                type="button"
                onClick={() => setIsEditingText(true)}
                className="text-indigo-400 hover:text-indigo-300 text-[11px]"
              >
                Edit
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveTranscript}
                className="text-emerald-400 hover:text-emerald-300 text-[11px] font-semibold"
              >
                Save
              </button>
            )}
          </div>
          {!isEditingText ? (
            <p className="text-sm text-slate-200 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 italic">
              "{scene.transcript}"
            </p>
          ) : (
            <textarea
              rows={2}
              value={editedTranscript}
              onChange={(e) => setEditedTranscript(e.target.value)}
              className="w-full bg-slate-950 border border-indigo-500/50 rounded-lg p-2.5 text-xs text-white focus:outline-none"
            />
          )}
        </div>

        {/* Visual Search Keywords */}
        <div className="space-y-1.5">
          <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] block">
            Visual Search Keywords:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {scene.keywords.map((kw, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs"
              >
                <Tag className="w-2.5 h-2.5 text-indigo-400" />
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(kw)}
                  className="hover:text-rose-400 ml-0.5 text-slate-500"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder="+ Add keyword..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={handleAddKeyword}
              className="bg-transparent border border-dashed border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => onSearchVideos(scene.id)}
              disabled={scene.isSearching}
              className="p-1.5 text-slate-400 hover:text-indigo-300 bg-slate-800 rounded-lg border border-slate-700 ml-1"
              title="Re-run search with current keywords"
            >
              {scene.isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCw className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Download Clip Error */}
        {downloadError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{downloadError}</span>
          </div>
        )}

        {/* Selected Video vs Alternatives Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2">
          {/* Currently Selected Video Preview */}
          <div className="md:col-span-6 space-y-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Selected Video</span>
              </span>
              {scene.selectedVideo && (
                <span className="text-[10px] text-slate-400 capitalize">
                  {scene.selectedVideo.source} ({scene.selectedVideo.duration}s clip)
                </span>
              )}
            </span>

            {scene.selectedVideo ? (
              <div
                className={`relative rounded-xl overflow-hidden bg-black border border-slate-700 shadow-md ${
                  aspectRatio === '9:16' ? 'aspect-[9/16] max-h-[380px] mx-auto' : 'aspect-video'
                }`}
              >
                <video
                  src={scene.selectedVideo.videoUrl}
                  controls
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white font-medium border border-white/10">
                  Will be trimmed to {scene.duration.toFixed(1)}s
                </div>
                {scene.selectedVideo.author && (
                  <div className="absolute bottom-2 left-2 right-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded text-[10px] text-slate-300 truncate border border-white/10 flex items-center justify-between">
                    <span className="truncate">By {scene.selectedVideo.author}</span>
                    {scene.selectedVideo.authorUrl && (
                      <a
                        href={scene.selectedVideo.authorUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 ml-1 inline-flex items-center"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-video bg-slate-950 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                <Film className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">No video selected yet</p>
                <button
                  type="button"
                  onClick={() => onSearchVideos(scene.id)}
                  className="mt-2 text-xs text-indigo-400 hover:underline"
                >
                  Search stock videos
                </button>
              </div>
            )}
          </div>

          {/* Alternative Choices */}
          <div className="md:col-span-6 space-y-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Alternative Video Choices ({scene.alternativeVideos.length})</span>
              {scene.isSearching && (
                <span className="text-[10px] text-indigo-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Searching...</span>
                </span>
              )}
            </span>

            {scene.alternativeVideos.length === 0 ? (
              <div className="p-6 bg-slate-950/40 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
                <p>No alternative videos loaded.</p>
                <button
                  type="button"
                  onClick={() => onSearchVideos(scene.id)}
                  className="mt-2 text-indigo-400 hover:underline"
                >
                  Search again with current keywords
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                {scene.alternativeVideos.map((alt) => {
                  const isCurrent = scene.selectedVideo?.id === alt.id;

                  return (
                    <div
                      key={alt.id}
                      className={`relative group rounded-xl overflow-hidden border bg-slate-950 transition-all ${
                        isCurrent
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="aspect-video relative overflow-hidden bg-slate-900">
                        <img
                          src={alt.previewUrl || 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400'}
                          alt={alt.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <span className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[9px] text-white font-mono">
                          {alt.duration}s
                        </span>
                        <span className="absolute top-1 left-1 bg-indigo-900/80 px-1 py-0.5 rounded text-[8px] text-indigo-200 capitalize">
                          {alt.source}
                        </span>
                      </div>

                      <div className="p-2 space-y-1">
                        <p className="text-[10px] text-slate-300 font-medium truncate">
                          {alt.title}
                        </p>
                        <button
                          type="button"
                          onClick={() => onSelectVideo(scene.id, alt)}
                          className={`w-full py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                            isCurrent
                              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                          }`}
                        >
                          {isCurrent ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Current</span>
                            </>
                          ) : (
                            <span>Use this video</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
