
import React, { useState, useEffect } from 'react';

interface ReplayControlsProps {
  duration: number; // in seconds
  currentTime: number; // in seconds
  isPlaying: boolean;
  playbackSpeed: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onClose: () => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const ReplayControls: React.FC<ReplayControlsProps> = ({
  duration,
  currentTime,
  isPlaying,
  playbackSpeed,
  onTogglePlay,
  onSeek,
  onSpeedChange,
  onClose,
}) => {
  const [seekValue, setSeekValue] = useState(currentTime);
  
  // Sync internal slider state with prop, unless dragging
  useEffect(() => {
    setSeekValue(currentTime);
  }, [currentTime]);

  return (
    <div className="w-full bg-gray-900/90 backdrop-blur-xl border-t border-white/10 p-4 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
      <div className="max-w-4xl mx-auto flex flex-col gap-3">
        
        {/* Timeline Slider */}
        <div className="flex items-center gap-3">
             <span className="text-xs font-mono text-cyan-400 w-16 text-right">{formatTime(currentTime)}</span>
             <div className="relative flex-grow h-6 flex items-center group">
                {/* Track Background */}
                <div className="absolute w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" 
                        style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                </div>
                {/* Thumb Input */}
                <input 
                    type="range" 
                    min="0" 
                    max={duration} 
                    step="0.01"
                    value={seekValue}
                    onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSeekValue(val);
                        onSeek(val);
                    }}
                    className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                />
                {/* Custom Thumb Visual */}
                <div 
                    className="absolute h-4 w-4 bg-white rounded-full shadow-lg pointer-events-none transition-transform duration-75 ease-out group-hover:scale-125"
                    style={{ left: `calc(${(currentTime / duration) * 100}% - 8px)` }}
                />
             </div>
             <span className="text-xs font-mono text-gray-500 w-16">{formatTime(duration)}</span>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-center gap-6 mt-2">
            
            <button onClick={onClose} className="absolute left-4 md:static text-xs uppercase font-bold text-rose-400 hover:text-rose-300 px-3 py-2 rounded-lg hover:bg-rose-900/30 transition-colors">
                Exit Replay
            </button>

            {/* Speed Toggle */}
            <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
                {[0.5, 1, 2].map(speed => (
                    <button 
                        key={speed}
                        onClick={() => onSpeedChange(speed)}
                        className={`px-2 py-1 text-xs font-bold rounded ${playbackSpeed === speed ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        {speed}x
                    </button>
                ))}
            </div>

            {/* Play/Pause Main Button */}
            <button 
                onClick={onTogglePlay}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-white text-gray-900 hover:bg-cyan-400 hover:scale-105 transition-all shadow-lg shadow-cyan-900/20"
            >
                {isPlaying ? (
                    <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                    <svg className="w-6 h-6 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
            </button>

            <div className="w-16 hidden md:block"></div> {/* Spacer to balance Exit button */}
        </div>

      </div>
    </div>
  );
};

export default ReplayControls;
