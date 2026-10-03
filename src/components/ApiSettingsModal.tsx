import React, { useState } from 'react';
import { ApiSettings } from '../types';
import { testApiKeys } from '../services/api';
import { X, Key, ShieldAlert, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ApiSettings;
  onSave: (settings: ApiSettings) => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [pexelsKey, setPexelsKey] = useState(settings.pexelsKey || '');
  const [pixabayKey, setPixabayKey] = useState(settings.pixabayKey || '');
  const [showPexels, setShowPexels] = useState(false);
  const [showPixabay, setShowPixabay] = useState(false);

  const [testingPexels, setTestingPexels] = useState(false);
  const [testingPixabay, setTestingPixabay] = useState(false);

  const [pexelsStatus, setPexelsStatus] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [pixabayStatus, setPixabayStatus] = useState<{ ok?: boolean; message?: string } | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      pexelsKey: pexelsKey.trim(),
      pixabayKey: pixabayKey.trim(),
    });
    onClose();
  };

  const handleTestPexels = async () => {
    setTestingPexels(true);
    setPexelsStatus(null);
    try {
      const res = await testApiKeys({ pexelsKey: pexelsKey.trim(), pixabayKey: '' });
      setPexelsStatus(res.pexels);
    } catch (err: any) {
      setPexelsStatus({ ok: false, message: err.message || 'Connection failed' });
    } finally {
      setTestingPexels(false);
    }
  };

  const handleTestPixabay = async () => {
    setTestingPixabay(true);
    setPixabayStatus(null);
    try {
      const res = await testApiKeys({ pexelsKey: '', pixabayKey: pixabayKey.trim() });
      setPixabayStatus(res.pixabay);
    } catch (err: any) {
      setPixabayStatus({ ok: false, message: err.message || 'Connection failed' });
    } finally {
      setTestingPixabay(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">API Settings</h2>
              <p className="text-xs text-slate-400">Configure your stock video API credentials</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Security Notice */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3 text-xs text-amber-300">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-amber-200 block">Security & Storage Notice:</span>
              <p className="text-amber-300/90 leading-relaxed">
                Keys entered here are securely passed to the backend proxy for video search and saved in your local browser storage for convenience. Browser local storage is accessible by scripts in this origin, so do not store highly sensitive secrets. You can also configure keys as server environment variables (<code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-200">PEXELS_API_KEY</code>, <code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-200">PIXABAY_API_KEY</code>).
              </p>
            </div>
          </div>

          {/* Pexels API Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <span>Pexels API Key</span>
                <span className="text-[10px] text-slate-400 font-normal">(Free, 200 req/hr)</span>
              </label>
              <a
                href="https://www.pexels.com/api/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
              >
                <span>Get key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showPexels ? 'text' : 'password'}
                value={pexelsKey}
                onChange={(e) => {
                  setPexelsKey(e.target.value);
                  setPexelsStatus(null);
                }}
                placeholder="Enter your Pexels API key..."
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono pr-20"
              />
              <button
                type="button"
                onClick={() => setShowPexels(!showPexels)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 px-1.5 py-0.5"
              >
                {showPexels ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestPexels}
                disabled={testingPexels || !pexelsKey.trim()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg border border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                {testingPexels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Test Pexels</span>
              </button>

              {pexelsStatus && (
                <div
                  className={`text-xs flex items-center gap-1.5 ${
                    pexelsStatus.ok ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {pexelsStatus.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate max-w-[200px]">{pexelsStatus.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Pixabay API Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <span>Pixabay API Key</span>
                <span className="text-[10px] text-slate-400 font-normal">(Free, 5,000 req/hr)</span>
              </label>
              <a
                href="https://pixabay.com/api/docs/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
              >
                <span>Get key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showPixabay ? 'text' : 'password'}
                value={pixabayKey}
                onChange={(e) => {
                  setPixabayKey(e.target.value);
                  setPixabayStatus(null);
                }}
                placeholder="Enter your Pixabay API key..."
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono pr-20"
              />
              <button
                type="button"
                onClick={() => setShowPixabay(!showPixabay)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 px-1.5 py-0.5"
              >
                {showPixabay ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestPixabay}
                disabled={testingPixabay || !pixabayKey.trim()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg border border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                {testingPixabay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Test Pixabay</span>
              </button>

              {pixabayStatus && (
                <div
                  className={`text-xs flex items-center gap-1.5 ${
                    pixabayStatus.ok ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {pixabayStatus.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate max-w-[200px]">{pixabayStatus.message}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-900/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors"
          >
            Save Keys
          </button>
        </div>
      </div>
    </div>
  );
};
