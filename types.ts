
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface HistoryPoint {
    p: Vector3D;
    q: Quaternion;
    t: number; // Timestamp relative to start (ms)
    v: Vector3D; // Velocity Vector
    a: Vector3D; // Acceleration Vector (Linear)
}

export type DirectionMode = 'axis' | 'cardinal';
export type PhysicsMode = 'speed' | 'accel';

export interface PhysicsConfig {
    enableGravity: boolean;
    elasticity: number;
    mass: number;
    dimensions: {
        width: number;
        height: number;
        depth: number;
    };
}

export interface PathConfig {
    // Visual Modes
    directionMode: DirectionMode;
    physicsMode: PhysicsMode;

    // Axis Mode Colors
    xColor: string;
    yColor: string;
    zColor: string;
    
    // Cardinal Mode Colors
    nColor: string; // -Z
    sColor: string; // +Z
    eColor: string; // +X
    wColor: string; // -X
    
    // Speed/Accel Gradients
    lowColor: string;
    highColor: string;
    
    // Line Style
    opacity: number;
    lineWidth: number; // Now represents Ribbon Width
    isDashed: boolean; // Note: Dashed ribbons are complex, will simulate via opacity or texture if needed, or fallback to gaps.
}
