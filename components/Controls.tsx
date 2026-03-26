
import React from 'react';

interface ControlsProps {
  isTracking: boolean;
  isReplaying: boolean;
  isCalibrated: boolean;
  hasHistory: boolean;
  onStart: () => void;
  onCalibrate: () => void;
  onStop: () => void;
  onReset: () => void;
  onEnterReplay: () => void;
  onZero: () => void;
  permissionStatus: string;
  isSecureContext: boolean;
  status: string;
  onOpenSettings: () => void;
}

const Button: React.FC<{ onClick: () => void; children: React.ReactNode; className: string; disabled?: boolean }> = ({ onClick, children, className, disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-3 md:px-6 md:py-4 rounded-xl font-bold text-sm md:text-lg shadow-lg transition-all duration-200 ease-in-out transform active:scale-95 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center ${className}`}
  >
    {children}
  </button>
);

const Controls: React.FC<ControlsProps> = ({ isTracking, isReplaying, isCalibrated, hasHistory, onStart, onCalibrate, onStop, onReset, onEnterReplay, onZero, permissionStatus, isSecureContext, status, onOpenSettings }) => {

  // If replaying, we hide this entire control bar because the ReplayBar takes over
  if (isReplaying) return null;

  const getCalibrationText = () => {
    if (!isSecureContext) return 'HTTPS Req.';
    if (permissionStatus === 'denied') return 'Denied';
    if (status.includes('Calibrating') || status.includes('Waiting')) return '...';
    return 'Calibrate';
  };

  return (
    <div className="w-full p-4 bg-gradient-to-t from-gray-900 via-gray-900/90 to-transparent backdrop-blur-md border-t border-white/10">
      <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-3">
        
        {/* Settings / Tuning */}
         <Button onClick={onOpenSettings} className="bg-gray-700/80 hover:bg-gray-600 text-white min-w-[60px]">
            ⚙️ Tune
        </Button>

        {/* Main Tracking Logic */}
        {!isTracking ? (
             isCalibrated ? (
                <>
                  <Button onClick={onZero} className="bg-amber-600 hover:bg-amber-500 text-white flex-grow basis-1/4">
                      ⚖️ Zero
                  </Button>

                  <Button onClick={onStart} className="bg-emerald-600 hover:bg-emerald-500 text-white flex-grow basis-1/3 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                      ▶ START
                  </Button>
                </>
             ) : (
                <Button onClick={onCalibrate} disabled={!isSecureContext || permissionStatus === 'denied'} className="bg-cyan-600 hover:bg-cyan-500 text-white flex-grow basis-1/2">
                    {getCalibrationText()}
                </Button>
             )
        ) : (
          <Button onClick={onStop} className="bg-rose-600 hover:bg-rose-500 text-white flex-grow basis-1/2 shadow-[0_0_20px_rgba(225,29,72,0.4)]">
            ⏹ STOP
          </Button>
        )}

        {/* Replay & Reset */}
        {!isTracking && hasHistory && (
             <Button onClick={onEnterReplay} className="bg-indigo-600 hover:bg-indigo-500 text-white flex-grow basis-1/4">
                🎥 Replay
             </Button>
        )}

        <Button onClick={onReset} className="bg-gray-600 hover:bg-gray-500 text-white min-w-[60px]">
          Reset
        </Button>
      </div>
      
       {!isSecureContext && (
         <p className="text-center text-rose-400 text-[10px] mt-2 font-mono">
            ⚠️ Secure Context (HTTPS) Required for Sensors
         </p>
       )}
    </div>
  );
};

export default Controls;
