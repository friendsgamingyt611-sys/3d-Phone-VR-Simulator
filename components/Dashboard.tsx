
import React from 'react';
import { Vector3D } from '../types';
import Compass from './Compass';

interface DashboardProps {
  position: Vector3D;
  velocity: Vector3D;
  heading: number;
  status: string;
  onSetNorth?: () => void;
  mass?: number;
  force?: number;
  rotationSpeed?: number;
}

const DataBox: React.FC<{ title: string; value: string; unit?: string; className?: string; highlight?: boolean }> = ({ title, value, unit, className, highlight = false }) => (
  <div className={`bg-gray-800/80 backdrop-blur p-2 rounded-lg text-center border border-gray-700/50 ${className}`}>
    <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80 ${highlight ? 'text-amber-400' : 'text-cyan-400'}`}>{title}</p>
    <p className="text-base md:text-lg font-mono font-bold text-white leading-none">
      {value}
      {unit && <span className="text-[10px] text-gray-400 ml-1 font-sans">{unit}</span>}
    </p>
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ position, velocity, heading, status, onSetNorth, mass = 0.2, force = 0, rotationSpeed = 0 }) => {
  const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
  
  return (
    <div className="w-full max-w-4xl mx-auto bg-gray-900/60 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-xl transition-all">
      <div className="flex flex-col md:flex-row items-center gap-4">
        
        {/* Left: Compass & Status */}
        <div className="flex flex-row items-center gap-4 w-full md:w-auto justify-between md:justify-start border-b md:border-b-0 md:border-r border-white/10 pb-3 md:pb-0 md:pr-4">
           <Compass heading={heading} onSetNorth={onSetNorth} />
           <div className="flex flex-col items-end md:items-start">
               <div className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-1">Status</div>
               <div className={`text-lg font-bold ${status === 'Tracking' ? 'text-green-400 animate-pulse' : 'text-white'}`}>
                   {status}
               </div>
           </div>
        </div>

        {/* Right: Data Grid */}
        <div className="grid grid-cols-4 gap-2 w-full">
          <DataBox title="Velocity" value={speed.toFixed(2)} unit="m/s" />
          <DataBox title="Force" value={force.toFixed(1)} unit="N" />
          <DataBox title="Rotation" value={rotationSpeed.toFixed(0)} unit="°/s" highlight={rotationSpeed > 50} />
          <DataBox title="X-Pos" value={position.x.toFixed(1)} unit="m" />
          
          <DataBox title="Z-Pos" value={position.z.toFixed(1)} unit="m" />
          <DataBox title="Height (Y)" value={position.y.toFixed(2)} unit="m" className="col-span-2 bg-slate-700/50" />
          <div className="col-span-1 flex items-center justify-center">
              <div className={`w-3 h-3 rounded-full transition-colors duration-200 ${rotationSpeed > 50 ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
