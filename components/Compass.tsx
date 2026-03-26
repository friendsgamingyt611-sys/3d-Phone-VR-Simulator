
import React, { useEffect, useState, useRef } from 'react';

interface CompassProps {
  heading: number;
  onSetNorth?: () => void;
}

const Compass: React.FC<CompassProps> = ({ heading, onSetNorth }) => {
  // --- Smooth Rotation Logic ---
  // We track a cumulative rotation value to avoid the "jump" from 359 to 0.
  // If heading goes 350 -> 10, delta is -340. Logic converts this to +20.
  // Cumulative becomes 370. Rendered rotation is -370 (visually same as -10).
  const [displayHeading, setDisplayHeading] = useState(heading);
  const lastHeadingRef = useRef(heading);
  const cumulativeRotationRef = useRef(heading);

  useEffect(() => {
    const current = heading;
    const previous = lastHeadingRef.current;
    
    let delta = current - previous;
    
    // Shortest path correction
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    
    cumulativeRotationRef.current += delta;
    lastHeadingRef.current = current;
    
    setDisplayHeading(cumulativeRotationRef.current);
  }, [heading]);

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center relative border-4 border-gray-700 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
        {/* Fixed Directions (Phone Bezel) */}
        <div className="absolute text-red-500 font-bold top-0 text-[10px] tracking-widest">N</div>
        <div className="absolute text-gray-400 font-bold bottom-0 text-[10px]">S</div>
        <div className="absolute text-gray-400 font-bold left-1 text-[10px]">W</div>
        <div className="absolute text-gray-400 font-bold right-1 text-[10px]">E</div>
        
        {/* Needle Container - Smoothly Rotates to point North */}
        {/* Note: We rotate by -displayHeading because if we face East (+90), North is to our Left (-90) */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-300 ease-out will-change-transform"
          style={{ transform: `rotate(${-displayHeading}deg)` }}
        >
          {/* North Needle (Red) */}
          <div className="w-1.5 h-8 bg-red-600 absolute top-1.5 rounded-full shadow-sm z-10" style={{ transform: 'translateY(-15%)' }}></div>
          {/* South Needle (White) */}
          <div className="w-1.5 h-8 bg-gray-300 absolute bottom-1.5 rounded-full opacity-90" style={{ transform: 'translateY(15%)' }}></div>
          
          {/* Decorative Center */}
          <div className="w-3 h-3 bg-gray-800 rounded-full z-20 border border-gray-500"></div>
          <div className="w-0.5 h-0.5 bg-red-500 rounded-full z-30 absolute"></div>
        </div>
      </div>
      
      {/* Digital Readout & Controls */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-xl font-mono font-bold text-cyan-300 drop-shadow-md">
            {Math.round(heading).toString().padStart(3, '0')}°
        </span>
        {onSetNorth && (
            <button 
                onClick={onSetNorth}
                className="text-[10px] uppercase bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded border border-gray-600 transition-colors"
            >
                Set North
            </button>
        )}
      </div>
    </div>
  );
};

export default Compass;
