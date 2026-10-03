/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  AudioFileRecord,
  Scene,
  AspectRatio,
  ApiSettings,
  StockVideoClip,
  AnalysisProgress,
} from './types';
import {
  saveAudioToStorage,
  loadAudioFromStorage,
  saveScenesToStorage,
  loadScenesFromStorage,
  saveSettingsToStorage,
  loadSettingsFromStorage,
  analyzeAudio,
  searchStockVideos,
} from './services/api';
import { Header } from './components/Header';
import { WorkflowSteps } from './components/WorkflowSteps';
import { AudioUploader } from './components/AudioUploader';
import { SceneTimeline } from './components/SceneTimeline';
import { SceneCard } from './components/SceneCard';
import { VideoBuilder } from './components/VideoBuilder';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { Loader2, Film, AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [audio, setAudio] = useState<AudioFileRecord | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [apiSettings, setApiSettings] = useState<ApiSettings>(loadSettingsFromStorage());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>({
    stage: 'idle',
    percent: 0,
    message: '',
  });

  const [activeSceneId, setActiveSceneId] = useState<string | undefined>(undefined);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);

  // Load persisted session on initial mount
  useEffect(() => {
    const savedAudio = loadAudioFromStorage();
    if (savedAudio) {
      setAudio(savedAudio);
    }
    const savedScenes = loadScenesFromStorage();
    if (savedScenes && savedScenes.length > 0) {
      setScenes(savedScenes);
      setActiveSceneId(savedScenes[0].id);
    }
  }, []);

  // Save changes to storage
  useEffect(() => {
    saveAudioToStorage(audio);
  }, [audio]);

  useEffect(() => {
    saveScenesToStorage(scenes);
  }, [scenes]);

  // Determine current workflow step
  let currentStep = 1;
  if (audio && (audio.status === 'ready' || audio.status === 'complete')) {
    currentStep = 2;
  }
  if (scenes.length > 0) {
    currentStep = 3;
    const hasAllSelected = scenes.every((s) => s.selectedVideo);
    if (hasAllSelected) {
      currentStep = 4;
    }
  }

  // Audio Upload / Replacement Handler
  const handleAudioUploaded = (newAudio: AudioFileRecord) => {
    setAudio(newAudio);
    // If a new audio file is uploaded, reset previous scenes
    if (!audio || audio.id !== newAudio.id) {
      setScenes([]);
      setActiveSceneId(undefined);
    }
  };

  // Full Voiceover Analysis & Stock Search Handler
  const handleAnalyze = async (transcriptHint?: string) => {
    if (!audio) return;

    setIsAnalyzing(true);
    setGlobalNotice(null);
    setAnalysisProgress({
      stage: 'transcribing',
      percent: 25,
      message: 'Transcribing speech & analyzing timestamps...',
    });

    try {
      const result = await analyzeAudio(audio.id, audio.duration, transcriptHint);
      const newScenes = result.scenes;

      setAnalysisProgress({
        stage: 'segmenting',
        percent: 60,
        message: `Generated ${newScenes.length} scenes. Searching matching stock videos...`,
      });

      // Search stock videos for each scene
      const orientationParam = aspectRatio === '9:16' ? 'portrait' : 'landscape';
      const populatedScenes: Scene[] = [];

      for (let i = 0; i < newScenes.length; i++) {
        const sc = newScenes[i];
        const query = sc.keywords.slice(0, 3).join(' ') || sc.transcript.slice(0, 30);

        setAnalysisProgress({
          stage: 'searching',
          percent: 60 + Math.round(((i + 1) / newScenes.length) * 35),
          message: `Finding stock videos for Scene ${sc.sceneNumber} (${sc.duration}s)...`,
        });

        const searchRes = await searchStockVideos(query, orientationParam, apiSettings);
        const videos = searchRes.videos;

        // Auto-select best matching video
        const bestVideo = videos.length > 0 ? videos[0] : undefined;

        populatedScenes.push({
          ...sc,
          selectedVideo: bestVideo,
          alternativeVideos: videos,
          isSearching: false,
        });

        if (searchRes.pexelsWarning && searchRes.pixabayWarning) {
          setGlobalNotice('Stock API keys not configured. Loaded curated royalty-free fallback clips.');
        }
      }

      setScenes(populatedScenes);
      setActiveSceneId(populatedScenes[0]?.id);

      // Update audio status to complete
      setAudio((prev) => (prev ? { ...prev, status: 'complete' } : null));

      setAnalysisProgress({
        stage: 'complete',
        percent: 100,
        message: 'Scenes generated and stock clips matched!',
      });
    } catch (err: any) {
      console.error('Analysis error:', err);
      setAnalysisProgress({
        stage: 'error',
        percent: 0,
        message: err.message || 'Failed to analyze audio.',
      });
      setGlobalNotice(err.message || 'Error occurred during voiceover analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Search stock videos for a specific scene
  const handleSearchSceneVideos = async (sceneId: string, customQuery?: string) => {
    const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
    if (sceneIndex === -1) return;

    const scene = scenes[sceneIndex];
    const query = customQuery || scene.keywords.join(' ') || scene.transcript;
    const orientationParam = aspectRatio === '9:16' ? 'portrait' : 'landscape';

    // Mark as searching
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, isSearching: true } : s))
    );

    try {
      const res = await searchStockVideos(query, orientationParam, apiSettings);
      const videos = res.videos;

      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                alternativeVideos: videos,
                selectedVideo: videos[0] || s.selectedVideo,
                isSearching: false,
              }
            : s
        )
      );
    } catch (err) {
      setScenes((prev) =>
        prev.map((s) => (s.id === sceneId ? { ...s, isSearching: false } : s))
      );
    }
  };

  // Select video for a scene
  const handleSelectVideoForScene = (sceneId: string, video: StockVideoClip) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, selectedVideo: video } : s))
    );
  };

  // Update scene timing
  const handleUpdateSceneTimes = (sceneId: string, newStart: number, newEnd: number) => {
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id === sceneId) {
          const duration = Math.round((newEnd - newStart) * 10) / 10;
          return {
            ...s,
            startTime: newStart,
            endTime: newEnd,
            duration,
          };
        }
        return s;
      })
    );
  };

  // Update scene keywords
  const handleUpdateKeywords = (sceneId: string, keywords: string[]) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, keywords } : s))
    );
  };

  // Update scene transcript
  const handleUpdateTranscript = (sceneId: string, transcript: string) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, transcript } : s))
    );
  };

  // Reset Project
  const handleResetProject = () => {
    if (confirm('Start a new project? This will clear the current voiceover and scenes.')) {
      setAudio(null);
      setScenes([]);
      setActiveSceneId(undefined);
      setGlobalNotice(null);
      saveAudioToStorage(null);
      saveScenesToStorage([]);
    }
  };

  // Save API Settings
  const handleSaveSettings = (newSettings: ApiSettings) => {
    setApiSettings(newSettings);
    saveSettingsToStorage(newSettings);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <Header
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onResetProject={handleResetProject}
        hasAudio={Boolean(audio)}
        hasPexelsKey={Boolean(apiSettings.pexelsKey)}
        hasPixabayKey={Boolean(apiSettings.pixabayKey)}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Workflow 5 Steps Indicator */}
        <WorkflowSteps currentStep={currentStep} />

        {/* Global Notice / Banner if any */}
        {globalNotice && (
          <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{globalNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setGlobalNotice(null)}
              className="text-slate-400 hover:text-white text-xs ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* STEP 1 & 2: Audio Uploader */}
        <section>
          <AudioUploader
            audio={audio}
            onAudioUploaded={handleAudioUploaded}
            onAnalyze={handleAnalyze}
            onReset={handleResetProject}
            isAnalyzing={isAnalyzing}
            analysisProgress={analysisProgress}
            hasAnalyzedScenes={scenes.length > 0}
          />
        </section>

        {/* STEP 2: Scene Timeline */}
        {scenes.length > 0 && audio && (
          <section>
            <SceneTimeline
              scenes={scenes}
              totalDuration={audio.duration}
              activeSceneId={activeSceneId}
              onSelectScene={(id) => {
                setActiveSceneId(id);
                const el = document.getElementById(`scene-card-${id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              onUpdateSceneTimes={handleUpdateSceneTimes}
            />
          </section>
        )}

        {/* STEP 3: Scene Cards & Stock Video Selection */}
        {scenes.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/30">
                    3
                  </span>
                  <span>Scene Visuals & Stock Video Matching</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Review matched stock videos for each scene, preview, or pick an alternative.
                </p>
              </div>

              <span className="text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                {scenes.filter((s) => s.selectedVideo).length} of {scenes.length} scenes matched
              </span>
            </div>

            <div className="space-y-4">
              {scenes.map((scene) => (
                <div key={scene.id} id={`scene-card-${scene.id}`}>
                  <SceneCard
                    scene={scene}
                    aspectRatio={aspectRatio}
                    onSelectVideo={handleSelectVideoForScene}
                    onSearchVideos={handleSearchSceneVideos}
                    onUpdateKeywords={handleUpdateKeywords}
                    onUpdateTranscript={handleUpdateTranscript}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* STEP 4 & 5: Video Builder, Synchronized Preview & Download */}
        {scenes.length > 0 && audio && (
          <section>
            <VideoBuilder
              audio={audio}
              scenes={scenes}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
            />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>
            Voiceover → Stock Video Creator • Powered by FFmpeg, Pexels & Pixabay APIs
          </p>
          <div className="flex items-center gap-4 text-slate-400">
            <a
              href="https://www.pexels.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-indigo-400 transition-colors"
            >
              Pexels Attribution
            </a>
            <span>•</span>
            <a
              href="https://pixabay.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-indigo-400 transition-colors"
            >
              Pixabay Attribution
            </a>
          </div>
        </div>
      </footer>

      {/* API Settings Modal */}
      <ApiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={apiSettings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
