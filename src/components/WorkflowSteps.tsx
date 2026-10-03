import React from 'react';
import { Upload, Cpu, Search, Sparkles, Download } from 'lucide-react';

interface WorkflowStepsProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
}

const steps = [
  { number: 1, title: 'Upload Voiceover', icon: Upload },
  { number: 2, title: 'Analyze Voiceover', icon: Cpu },
  { number: 3, title: 'Find Stock Videos', icon: Search },
  { number: 4, title: 'Build Video', icon: Sparkles },
  { number: 5, title: 'Preview & Download', icon: Download },
];

export const WorkflowSteps: React.FC<WorkflowStepsProps> = ({ currentStep, onStepClick }) => {
  return (
    <div className="w-full bg-slate-900/60 border border-slate-800 rounded-xl p-3 sm:p-4 my-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        {steps.map((step) => {
          const Icon = step.icon;
          const isDone = currentStep > step.number;
          const isCurrent = currentStep === step.number;

          return (
            <button
              key={step.number}
              type="button"
              disabled={!onStepClick || (!isDone && !isCurrent)}
              onClick={() => onStepClick && isDone && onStepClick(step.number)}
              className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                isCurrent
                  ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-300 ring-1 ring-indigo-500/20'
                  : isDone
                  ? 'bg-slate-800/80 border-slate-700/60 text-emerald-400 hover:border-slate-600 cursor-pointer'
                  : 'bg-slate-900/40 border-slate-800/60 text-slate-500 cursor-not-allowed'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs font-semibold ${
                  isCurrent
                    ? 'bg-indigo-600 text-white'
                    : isDone
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {isDone ? '✓' : step.number}
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] uppercase font-bold tracking-wider opacity-60">
                  Step {step.number}
                </span>
                <span className="block text-xs font-medium truncate text-slate-200">
                  {step.title}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
