import React, { useState } from 'react';
import { Scene } from '../types';
import { Clock, Edit3, Check, Plus, Trash2, ArrowRight } from 'lucide-react';

interface SceneTimelineProps {
  scenes: Scene[];
  totalDuration: number;
  activeSceneId?: string;
  onSelectScene?: (sceneId: string) => void;
  onUpdateSceneTimes?: (sceneId: string, newStart: number, newEnd: number) => void;
}

export const SceneTimeline: React.FC<SceneTimelineProps> = ({
  scenes,
  totalDuration,
  activeSceneId,
  onSelectScene,
  onUpdateSceneTimes,
}) => {
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState<number>(0);
  const [editEnd, setEditEnd] = useState<number>(0);

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

  const startEditing = (scene: Scene) => {
    setEditingSceneId(scene.id);
    setEditStart(scene.startTime);
    setEditEnd(scene.endTime);
  };

  const saveEditing = (sceneId: string) => {
    if (onUpdateSceneTimes) {
      const validStart = Math.max(0, editStart);
      const validEnd = Math.max(validStart + 0.5, editEnd);
      onUpdateSceneTimes(sceneId, validStart, validEnd);
    }
    setEditingSceneId(null);
  };

  // Color palette for timeline blocks
  const colors = [
    'from-indigo-600 to-indigo-500 border-indigo-400/50',
    'from-violet-600 to-violet-500 border-violet-400/50',
    'from-blue-600 to-blue-500 border-blue-400/50',
    'from-cyan-600 to-cyan-500 border-cyan-400/50',
    'from-emerald-600 to-emerald-500 border-emerald-400/50',
    'from-amber-600 to-amber-500 border-amber-400/50',
  ];

  if (scenes.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/30">
              2
            </span>
            <span>Visual Scene Timeline</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Exact time boundaries aligned with your voiceover audio ({totalDuration.toFixed(1)}s total)
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>{scenes.length} Scenes</span>
          <span>•</span>
          <span>Total: <strong className="text-slate-200">{totalDuration.toFixed(1)}s</strong></span>
        </div>
      </div>

      {/* Visual Timeline Bar (Proportional Blocks) */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-950 rounded-xl p-1.5 border border-slate-800 flex gap-1 h-12 overflow-hidden shadow-inner">
          {scenes.map((scene, idx) => {
            const widthPercent = totalDuration > 0 ? (scene.duration / totalDuration) * 100 : 100 / scenes.length;
            const colorClass = colors[idx % colors.length];
            const isActive = activeSceneId === scene.id;

            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => onSelectScene && onSelectScene(scene.id)}
                style={{ width: `${Math.max(6, widthPercent)}%` }}
                className={`relative h-full rounded-lg bg-gradient-to-r ${colorClass} border transition-all flex flex-col justify-center px-2 text-left group overflow-hidden ${
                  isActive ? 'ring-2 ring-white scale-[1.02] z-10' : 'hover:opacity-90'
                }`}
                title={`Scene ${scene.sceneNumber}: ${formatTime(scene.startTime)} - ${formatTime(scene.endTime)} (${scene.duration}s)`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-white drop-shadow">
                  <span>#{scene.sceneNumber}</span>
                  <span className="opacity-90 text-[10px]">{scene.duration}s</span>
                </div>
                <div className="text-[10px] text-white/80 truncate font-medium">
                  {scene.keywords[0] || scene.transcript}
                </div>
              </button>
            );
          })}
        </div>

        {/* Time Markers */}
        <div className="flex justify-between text-[10px] text-slate-500 font-mono px-1">
          <span>00:00.0</span>
          <span>{formatTime(totalDuration / 2)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Detailed Scene List / Breakdown */}
      <div className="space-y-2">
        {scenes.map((scene) => {
          const isEditing = editingSceneId === scene.id;
          const isActive = activeSceneId === scene.id;

          return (
            <div
              key={scene.id}
              onClick={() => onSelectScene && onSelectScene(scene.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isActive
                  ? 'bg-slate-800/90 border-indigo-500/60 shadow-md ring-1 ring-indigo-500/30'
                  : 'bg-slate-850/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center text-xs font-bold shrink-0">
                  #{scene.sceneNumber}
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-slate-200">
                      {formatTime(scene.startTime)} - {formatTime(scene.endTime)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {scene.duration.toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 truncate mt-0.5 font-medium">
                    {scene.transcript}
                  </p>
                </div>
              </div>

              {/* Editing or Keywords */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {isEditing ? (
                  <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-lg border border-slate-700 text-xs">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={editStart}
                      onChange={(e) => setEditStart(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-white font-mono text-xs"
                      title="Start time (s)"
                    />
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="number"
                      step="0.5"
                      min={editStart + 0.5}
                      value={editEnd}
                      onChange={(e) => setEditEnd(parseFloat(e.target.value) || editStart + 1)}
                      className="w-16 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-white font-mono text-xs"
                      title="End time (s)"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveEditing(scene.id);
                      }}
                      className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="hidden sm:flex flex-wrap gap-1">
                      {scene.keywords.slice(0, 3).map((kw, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700/60 text-[11px]"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                    {onUpdateSceneTimes && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(scene);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-md transition-colors"
                        title="Edit Timing"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
