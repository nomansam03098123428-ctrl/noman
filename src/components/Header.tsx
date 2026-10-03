import React from 'react';
import { AspectRatio } from '../types';
import { Settings, RefreshCw, Smartphone, Monitor, Film } from 'lucide-react';

interface HeaderProps {
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onOpenSettings: () => void;
  onResetProject: () => void;
  hasAudio: boolean;
  hasPexelsKey: boolean;
  hasPixabayKey: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  aspectRatio,
  onAspectRatioChange,
  onOpenSettings,
  onResetProject,
  hasAudio,
  hasPexelsKey,
  hasPixabayKey,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Voiceover <span className="text-indigo-400">→</span> Stock Video
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Turn your voiceover audio into synced visual scenes
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Aspect Ratio Switcher */}
          <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex items-center">
            <button
              type="button"
              onClick={() => onAspectRatioChange('9:16')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                aspectRatio === '9:16'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Vertical 9:16 (TikTok, Reels, Shorts)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>9:16</span>
            </button>
            <button
              type="button"
              onClick={() => onAspectRatioChange('16:9')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                aspectRatio === '16:9'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Landscape 16:9 (YouTube, Standard)"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>16:9</span>
            </button>
          </div>

          {/* Reset Project */}
          {hasAudio && (
            <button
              type="button"
              onClick={onResetProject}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition-colors"
              title="Start New Project"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* API Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 text-xs font-medium transition-all"
          >
            <Settings className="w-4 h-4 text-indigo-400" />
            <span>API Settings</span>
            <span className="flex h-2 w-2 relative ml-1">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  hasPexelsKey || hasPixabayKey ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  hasPexelsKey || hasPixabayKey ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
