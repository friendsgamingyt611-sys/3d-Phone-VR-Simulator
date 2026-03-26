
import React, { useState, useEffect, useRef } from 'react';
import { Vector3D, Quaternion, HistoryPoint, PathConfig, DirectionMode, PhysicsMode } from './types';
import Scene3D from './components/MapDisplay';
import Dashboard from './components/Dashboard';
import Controls from './components/Controls';
import ReplayControls from './components/ReplayControls';

// Let TypeScript know that THREE will be on the window object
declare const THREE: any;

interface DeviceMotionEventWithPermission extends DeviceMotionEvent {
    requestPermission?: () => Promise<'granted' | 'denied'>;
}
interface DeviceOrientationEventWithPermission extends DeviceOrientationEvent {
    requestPermission?: () => Promise<'granted' | 'denied'>;
    webkitCompassHeading?: number;
}

// Expanded Calibration Steps
type CalibrationStep = 
    | 'idle' 
    | 'floor_wait' 
    | 'floor_measuring' 
    | 'vertical_intro' 
    | 'vertical_measuring' 
    | 'horizontal_intro' 
    | 'horizontal_measuring' 
    | 'done';

const STORAGE_KEY = 'INS_CALIBRATION_DATA_V19_STABLE';

const App: React.FC = () => {
    // --- UI State ---
    const [isTracking, setIsTracking] = useState<boolean>(false);
    const [isReplaying, setIsReplaying] = useState<boolean>(false);
    const [isCalibrated, setIsCalibrated] = useState<boolean>(false);
    const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>('idle');
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [calibrationMsg, setCalibrationMsg] = useState<string>('');
    const [paramUpdateTrigger, setParamUpdateTrigger] = useState<number>(0);
    const [measuredDistance, setMeasuredDistance] = useState<number>(0);
    const [clearSignal, setClearSignal] = useState<number>(0); // Signal to clear path
    
    // --- Physical Properties ---
    const [deviceMass, setDeviceMass] = useState<number>(0.2); // kg
    const [instantForce, setInstantForce] = useState<number>(0); // Newtons
    const [rotationSpeed, setRotationSpeed] = useState<number>(0); // deg/s

    // --- Path Customization ---
    const [pathConfig, setPathConfig] = useState<PathConfig>({
        directionMode: 'axis',
        physicsMode: 'speed',
        
        xColor: '#ff4444',
        yColor: '#44ff44',
        zColor: '#4444ff',
        nColor: '#ef4444', // Red
        sColor: '#3b82f6', // Blue
        eColor: '#10b981', // Green
        wColor: '#f59e0b', // Yellow
        lowColor: '#06b6d4', // Cyan (Slow/LowG)
        highColor: '#ef4444', // Red (Fast/HighG)
        opacity: 0.8,
        lineWidth: 6, // Thicker for ribbon visibility
        isDashed: false
    });

    // --- Physics Display State ---
    const [position, setPosition] = useState<Vector3D>({ x: 0, y: 0, z: 0 });
    const [orientation, setOrientation] = useState<Quaternion>({ x: 0, y: 0, z: 0, w: 1 });
    const [velocity, setVelocity] = useState<Vector3D>({ x: 0, y: 0, z: 0 });
    const [acceleration, setAcceleration] = useState<Vector3D>({ x: 0, y: 0, z: 0 });

    const [heading, setHeading] = useState<number>(0);
    const [status, setStatus] = useState<string>('Idle');
    const [permissionStatus, setPermissionStatus] = useState<string>('prompt');
    const [isSecureContext, setIsSecureContext] = useState<boolean>(false);
    const [isPhysicsReady, setIsPhysicsReady] = useState<boolean>(false);

    // --- REPLAY STATE ---
    const [replayCurrentTime, setReplayCurrentTime] = useState<number>(0);
    const [replayDuration, setReplayDuration] = useState<number>(0);
    const [isReplayPaused, setIsReplayPaused] = useState<boolean>(false);
    const [replaySpeed, setReplaySpeed] = useState<number>(1.0);
    const [recordedPath, setRecordedPath] = useState<HistoryPoint[]>([]);

    // --- STATE REFS ---
    const isTrackingRef = useRef(isTracking);
    const isCalibratedRef = useRef(isCalibrated);
    const calibrationStepRef = useRef(calibrationStep);
    const isReplayingRef = useRef(isReplaying);
    const isReplayPausedRef = useRef(isReplayPaused);
    const replaySpeedRef = useRef(replaySpeed);

    useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);
    useEffect(() => { isCalibratedRef.current = isCalibrated; }, [isCalibrated]);
    useEffect(() => { calibrationStepRef.current = calibrationStep; }, [calibrationStep]);
    useEffect(() => { isReplayingRef.current = isReplaying; }, [isReplaying]);
    useEffect(() => { isReplayPausedRef.current = isReplayPaused; }, [isReplayPaused]);
    useEffect(() => { replaySpeedRef.current = replaySpeed; }, [replaySpeed]);


    // --- PHYSICS ENGINE REFS ---
    const velocityRef = useRef<any>(null);      
    const positionRef = useRef<any>(null);      
    const rotationRateRef = useRef<number>(0);  
    
    // --- SENSOR FUSION REFS ---
    const deviceQuaternionRef = useRef<any>(null); 
    const biasVectorRef = useRef<any>(null);       
    const scaleVectorRef = useRef<any>(null);      
    const northOffsetRef = useRef<number>(0); 
    
    // --- ADVANCED PHYSICS PARAMETERS REF ---
    const physicsParamsRef = useRef({
        gravity: 9.80665,       
        drag: 3.0,              // HIGH FRICTION: Stops "ice skating" effect
        motionThreshold: 0.05,  // REDUCED DEADZONE: Allows smaller calibration movements
        varianceThreshold: 0.015, // HIGHER VARIANCE: Easier to detect "stationary"
        zuptWindow: 12,         // Quick Stationary Detection (approx 0.2s)
        continuousBias: true,   
        gyroGate: 15,           
        gyroDampening: 0.1      
    });
    
    const accelHistoryRef = useRef<number[]>([]); 

    // Event Handling Refs
    const lastTimestampRef = useRef<number>(0);
    const isZeroingRef = useRef<boolean>(false);
    const zeroingBufferRef = useRef<any[]>([]);

    // Replay History
    const historyRef = useRef<HistoryPoint[]>([]);
    const replayOffsetTimeRef = useRef<number>(0); 
    const replayAnimFrameRef = useRef<number>(0);

    const saveCalibration = () => {
        if (!biasVectorRef.current || !scaleVectorRef.current) return;
        
        const data = {
            bias: { x: biasVectorRef.current.x, y: biasVectorRef.current.y, z: biasVectorRef.current.z },
            scale: { x: scaleVectorRef.current.x, y: scaleVectorRef.current.y, z: scaleVectorRef.current.z },
            deviceMass: deviceMass,
            northOffset: northOffsetRef.current,
            pathConfig: pathConfig
        };
        
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn("Failed to save calibration", e);
        }
    };

    const loadCalibration = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && typeof THREE !== 'undefined') {
                const data = JSON.parse(saved);
                
                if (data.bias) biasVectorRef.current.set(data.bias.x, data.bias.y, data.bias.z);
                if (data.scale) scaleVectorRef.current.set(data.scale.x, data.scale.y, data.scale.z);
                if (data.deviceMass) setDeviceMass(data.deviceMass);
                if (data.northOffset) northOffsetRef.current = data.northOffset;
                if (data.pathConfig) setPathConfig(data.pathConfig);

                setIsCalibrated(true);
                setStatus('System Restored');
                return true;
            }
        } catch (e) {
            console.error("Failed to load calibration", e);
        }
        return false;
    };

    // --- Initialization ---
    useEffect(() => {
        setIsSecureContext(typeof window !== 'undefined' ? window.isSecureContext : false);
        
        const initPhysics = () => {
            if (typeof THREE === 'undefined') return false;
            if (velocityRef.current) return true;

            try {
                velocityRef.current = new THREE.Vector3(0, 0, 0);
                positionRef.current = new THREE.Vector3(0, 0, 0);
                
                deviceQuaternionRef.current = new THREE.Quaternion();
                biasVectorRef.current = new THREE.Vector3(0, 0, 0);
                scaleVectorRef.current = new THREE.Vector3(1, 1, 1);

                setIsPhysicsReady(true);
                return true;
            } catch (e) {
                console.error("Physics Init Error:", e);
                return false;
            }
        };

        if (!initPhysics()) {
            const interval = setInterval(() => {
                if (initPhysics()) clearInterval(interval);
            }, 200);
            return () => clearInterval(interval);
        }
    }, []);

    useEffect(() => {
        if (isPhysicsReady) {
            loadCalibration();
        }
    }, [isPhysicsReady]);

    // --- HIGH-FIDELITY PHYSICS ENGINE ---
    const handleMotion = (event: DeviceMotionEvent) => {
        if (typeof THREE === 'undefined' || !velocityRef.current) return;
        if (isReplayingRef.current) return;
        
        if (event.rotationRate) {
            const { alpha, beta, gamma } = event.rotationRate;
            const rate = Math.sqrt(Math.pow(alpha || 0, 2) + Math.pow(beta || 0, 2) + Math.pow(gamma || 0, 2));
            rotationRateRef.current = rate;
        }

        const isActive = isTrackingRef.current || isCalibratedRef.current || calibrationStepRef.current.includes('measuring');
        if (!isActive && !isZeroingRef.current) return;

        const now = performance.now();
        if (lastTimestampRef.current === 0) {
            lastTimestampRef.current = now;
            return;
        }
        let dt = (now - lastTimestampRef.current) / 1000;
        lastTimestampRef.current = now;
        if (dt > 0.1) dt = 0.1; 

        let rawAcc = new THREE.Vector3(0,0,0);
        let isLinear = false;

        if (event.acceleration && event.acceleration.x != null) {
             rawAcc.set(event.acceleration.x, event.acceleration.y, event.acceleration.z);
             isLinear = true;
        } else if (event.accelerationIncludingGravity && event.accelerationIncludingGravity.x != null) {
             rawAcc.set(
                 event.accelerationIncludingGravity.x, 
                 event.accelerationIncludingGravity.y, 
                 event.accelerationIncludingGravity.z
             );
             isLinear = false;
        } else {
            return;
        }

        // --- CALIBRATION ---
        if (isZeroingRef.current && deviceQuaternionRef.current) {
            zeroingBufferRef.current.push({
                acc: rawAcc.clone(),
                quat: deviceQuaternionRef.current.clone(),
                isLinear: isLinear
            });

            if (zeroingBufferRef.current.length > 60) { 
                const meanAcc = new THREE.Vector3(0,0,0);
                zeroingBufferRef.current.forEach(sample => meanAcc.add(sample.acc));
                meanAcc.divideScalar(zeroingBufferRef.current.length);
                
                if (isLinear) {
                    biasVectorRef.current.copy(meanAcc);
                } else {
                    const meanQuat = new THREE.Quaternion(0,0,0,0);
                    zeroingBufferRef.current.forEach(sample => {
                        meanQuat.x += sample.quat.x;
                        meanQuat.y += sample.quat.y;
                        meanQuat.z += sample.quat.z;
                        meanQuat.w += sample.quat.w;
                    });
                    meanQuat.normalize();

                    const worldGravityReaction = new THREE.Vector3(0, physicsParamsRef.current.gravity, 0);
                    const expectedDeviceAcc = worldGravityReaction.clone().applyQuaternion(meanQuat.clone().invert());
                    const computedBias = new THREE.Vector3().subVectors(meanAcc, expectedDeviceAcc);
                    biasVectorRef.current.copy(computedBias);
                }
                
                velocityRef.current.set(0,0,0);
                if (calibrationStepRef.current === 'floor_measuring') {
                    positionRef.current.set(0,0,0); 
                }
                isZeroingRef.current = false;
                saveCalibration();
                if (calibrationStepRef.current === 'floor_measuring') {
                    setStatus('Floor Established. Lift phone...');
                    setTimeout(() => setCalibrationStep('vertical_intro'), 1000); 
                } else {
                    setStatus('Sensors Zeroed');
                    setTimeout(() => setStatus(isTrackingRef.current ? 'Tracking' : 'Ready'), 1500);
                }
            }
            return;
        }

        // --- PHYSICS STEP ---
        const accDevice = rawAcc.clone().sub(biasVectorRef.current);
        const accWorld = accDevice.clone().applyQuaternion(deviceQuaternionRef.current);

        if (!isLinear) {
            accWorld.y -= physicsParamsRef.current.gravity;
        }

        // Scaling
        if (scaleVectorRef.current) {
            accWorld.x *= scaleVectorRef.current.x;
            accWorld.y *= scaleVectorRef.current.y;
            accWorld.z *= scaleVectorRef.current.z;
        }

        // --- STABILITY & DEADZONES ---
        
        // 1. Axis-Specific Deadzones
        // Horizontal movement is prone to "Gravity Leak" (tilt interpreted as move).
        const baseThreshold = physicsParamsRef.current.motionThreshold;
        if (Math.abs(accWorld.y) < baseThreshold) accWorld.y = 0;
        if (Math.abs(accWorld.x) < baseThreshold) accWorld.x = 0;
        if (Math.abs(accWorld.z) < baseThreshold) accWorld.z = 0;

        // 2. ZUPT (Zero Velocity Update)
        // If rotation is low AND acceleration variance is low -> We are stationary.
        const isRotationStable = rotationRateRef.current < 5.0; 
        
        accelHistoryRef.current.push(accWorld.length());
        if (accelHistoryRef.current.length > physicsParamsRef.current.zuptWindow) accelHistoryRef.current.shift();
        
        const mean = accelHistoryRef.current.reduce((a,b)=>a+b, 0) / accelHistoryRef.current.length;
        const variance = accelHistoryRef.current.reduce((a,b)=>a + Math.pow(b-mean, 2), 0) / accelHistoryRef.current.length;
        
        const isStationary = (variance < physicsParamsRef.current.varianceThreshold) || (isRotationStable && accWorld.length() < 0.1);

        if (isStationary) {
            // Hard braking
            velocityRef.current.multiplyScalar(0.5); 
            if (velocityRef.current.lengthSq() < 0.01) {
                velocityRef.current.set(0,0,0);
            }
            accWorld.set(0,0,0);
        } else {
            // 3. Integration
            const dragFactor = Math.max(0, 1 - (physicsParamsRef.current.drag * dt));
            velocityRef.current.multiplyScalar(dragFactor);
            velocityRef.current.addScaledVector(accWorld, dt);
            
            // 4. Centimeter Precision Cutoff
            // If velocity is tiny (< 2cm/s), kill it to prevent creep
            if (velocityRef.current.lengthSq() < 0.0004) {
                 velocityRef.current.set(0,0,0);
            }
        }

        const vOld = velocityRef.current.clone(); // Use current (already integrated accel) or previous? Euler vs Verlet. 
        // Simple Euler: pos += vel * dt
        positionRef.current.addScaledVector(velocityRef.current, dt);

        // Ground collision
        if (positionRef.current.y < 0) {
            positionRef.current.y = 0;
            if (velocityRef.current.y < 0) velocityRef.current.y = 0;
        }

        // Update State
        setInstantForce(accWorld.length() * deviceMass); 
        setRotationSpeed(rotationRateRef.current);
        setAcceleration({ x: accWorld.x, y: accWorld.y, z: accWorld.z });
        setVelocity({ x: velocityRef.current.x, y: velocityRef.current.y, z: velocityRef.current.z });

        const distMoved = new THREE.Vector3(position.x, position.y, position.z).distanceTo(positionRef.current);
        if (distMoved > 0.001 || isStationary) { 
             setPosition({ x: positionRef.current.x, y: positionRef.current.y, z: positionRef.current.z });
        }

        if (calibrationStepRef.current === 'vertical_measuring') {
            setMeasuredDistance(Math.abs(positionRef.current.y));
        } else if (calibrationStepRef.current === 'horizontal_measuring') {
            setMeasuredDistance(Math.sqrt(positionRef.current.x**2 + positionRef.current.z**2));
        }

        if (isTrackingRef.current) {
            historyRef.current.push({ 
                p: { x: positionRef.current.x, y: positionRef.current.y, z: positionRef.current.z },
                q: { x: deviceQuaternionRef.current.x, y: deviceQuaternionRef.current.y, z: deviceQuaternionRef.current.z, w: deviceQuaternionRef.current.w },
                t: performance.now(),
                v: { x: velocityRef.current.x, y: velocityRef.current.y, z: velocityRef.current.z },
                a: { x: accWorld.x, y: accWorld.y, z: accWorld.z }
            });
            if (historyRef.current.length > 60000) historyRef.current.shift();
        }
    };

    const handleOrientation = (event: any) => {
        if (typeof THREE === 'undefined' || !deviceQuaternionRef.current) return;
        if (isReplayingRef.current) return;

        let alpha = event.alpha ? THREE.MathUtils.degToRad(event.alpha) : 0;
        let beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;
        let gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0;

        // iOS compass heading or absolute orientation
        if (event.webkitCompassHeading !== undefined) {
            alpha = THREE.MathUtils.degToRad(360 - event.webkitCompassHeading);
        }

        const orientDeg = window.screen?.orientation?.angle ?? window.orientation ?? 0;
        const orient = THREE.MathUtils.degToRad(orientDeg);

        const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
        const q = new THREE.Quaternion();
        q.setFromEuler(euler);

        const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X
        q.multiply(q1);

        const q0 = new THREE.Quaternion();
        q0.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orient);
        q.multiply(q0);
        
        const northRad = THREE.MathUtils.degToRad(northOffsetRef.current);
        const q_north = new THREE.Quaternion();
        q_north.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -northRad); 
        q.premultiply(q_north);

        // Smooth orientation to reduce gravity vector jitter
        deviceQuaternionRef.current.slerp(q, 0.8); 
        
        setOrientation({ x: q.x, y: q.y, z: q.z, w: q.w });
        
        let rawDeg = event.webkitCompassHeading !== undefined ? event.webkitCompassHeading : (360 - THREE.MathUtils.radToDeg(alpha));
        let adjustedHeading = (rawDeg - northOffsetRef.current + 360) % 360;
        setHeading(adjustedHeading);
    };

    const handleSetNorth = () => {
        const currentRaw = (heading + northOffsetRef.current) % 360;
        northOffsetRef.current = currentRaw;
        saveCalibration();
        setHeading(0);
        setStatus('North Set');
    };

    const startCalibrationWizard = async () => {
        if (!isPhysicsReady) return; 
        const granted = await requestPermissions();
        if (!granted) {
            setStatus('Permission Denied');
            return;
        }
        scaleVectorRef.current.set(1,1,1);
        setCalibrationStep('floor_wait');
        setStatus('Calibration Started');
        setCalibrationMsg('Place device on floor/table.');
    };

    const startFloorMeasure = () => {
        setCalibrationStep('floor_measuring');
        setStatus('Zeroing...');
        setCalibrationMsg('Don\'t touch the device.');
        handleZeroSensors(); 
    };

    const startVerticalMeasure = () => {
        velocityRef.current.set(0,0,0);
        positionRef.current.set(0,0,0);
        setCalibrationStep('vertical_measuring');
        setStatus('Lift 1 Meter...');
        setCalibrationMsg('Lift device exactly 1 meter vertically.');
    };

    const finishVerticalMeasure = () => {
        const measuredY = Math.abs(positionRef.current.y);
        if (measuredY > 0.1) {
            const ratio = 1.0 / measuredY;
            scaleVectorRef.current.y = ratio;
            setCalibrationMsg(`Vertical Scale Set: ${ratio.toFixed(2)}x`);
        } else {
             setCalibrationMsg(`Movement too small. Defaulting Y.`);
        }
        setCalibrationStep('horizontal_intro');
        setStatus('Vertical Done');
    };

    const startHorizontalMeasure = () => {
        velocityRef.current.set(0,0,0);
        positionRef.current.set(0,0,0);
        setCalibrationStep('horizontal_measuring');
        setStatus('Move 1 Meter Fwd...');
        setCalibrationMsg('Move device exactly 1 meter forward.');
    };

    const finishHorizontalMeasure = () => {
        const dist = Math.sqrt(positionRef.current.x**2 + positionRef.current.z**2);
        if (dist > 0.1) {
            const ratio = 1.0 / dist;
            scaleVectorRef.current.x = ratio;
            scaleVectorRef.current.z = ratio;
            setCalibrationMsg(`Horizontal Scale Set: ${ratio.toFixed(2)}x`);
        } else {
            setCalibrationMsg('Movement too small. Defaulting X/Z.');
        }
        setCalibrationStep('done');
        setIsCalibrated(true);
        saveCalibration();
        velocityRef.current.set(0,0,0);
        positionRef.current.set(0,0,0);
        setPosition({x:0,y:0,z:0});
        setStatus('Calibration Complete');
        setTimeout(() => {
            setCalibrationStep('idle');
            setStatus('Ready');
        }, 2000);
    };

    const handleZeroSensors = async () => {
        if (permissionStatus !== 'granted') {
            const granted = await requestPermissions();
            if (!granted) return;
        }
        isZeroingRef.current = true;
        zeroingBufferRef.current = [];
        setStatus('Zeroing Sensors...');

        // Timeout to detect lack of sensor data (e.g. on desktop)
        setTimeout(() => {
            if (isZeroingRef.current && zeroingBufferRef.current.length === 0) {
                isZeroingRef.current = false;
                setStatus('Error: No Sensor Data');
                setCalibrationStep('idle');
            }
        }, 3000);
    };

    const requestPermissions = async (): Promise<boolean> => {
        let granted = true;
        
        if (typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
            try {
                const response = await (DeviceMotionEvent as any).requestPermission();
                if (response !== 'granted') granted = false;
            } catch (e) {
                console.error(e);
                granted = false;
            }
        }
        
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            try {
                const response = await (DeviceOrientationEvent as any).requestPermission();
                if (response !== 'granted') granted = false;
            } catch (e) {
                console.error(e);
                granted = false;
            }
        }

        if (granted) {
            setPermissionStatus('granted');
            window.addEventListener('devicemotion', handleMotion as any);
            if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', handleOrientation as any);
            } else {
                window.addEventListener('deviceorientation', handleOrientation as any);
            }
            return true;
        } else {
            setPermissionStatus('denied');
            return false;
        }
    };

    const clearPath = () => {
        historyRef.current = [];
        setRecordedPath([]);
        if (isTracking) {
            historyRef.current.push({
                p: { ...position },
                q: { ...orientation },
                t: performance.now(),
                v: { ...velocity },
                a: { ...acceleration }
            });
        }
        setClearSignal(prev => prev + 1);
    };

    const toggleTracking = async () => {
        if (isTracking) {
            setIsTracking(false);
            setStatus('Stopped');
        } else {
            if (permissionStatus !== 'granted') {
                const granted = await requestPermissions();
                if (!granted) return;
            }
            clearPath();
            positionRef.current.set(0,0,0);
            velocityRef.current.set(0,0,0);
            setPosition({x:0,y:0,z:0});
            setIsTracking(true);
            setStatus('Tracking');
        }
    };

    const resetSystem = () => {
        if (velocityRef.current) velocityRef.current.set(0,0,0);
        if (positionRef.current) positionRef.current.set(0,0,0);
        setPosition({ x:0, y:0, z:0 });
        clearPath();
        setIsTracking(false);
        setIsCalibrated(false);
        setIsReplaying(false);
        setCalibrationStep('idle');
        setStatus('System Reset');
    };

    const startReplay = () => {
        if (historyRef.current.length < 2) return;
        setIsTracking(false);
        setIsReplaying(true);
        setIsReplayPaused(false);
        setStatus('Replay Mode');
        setRecordedPath([...historyRef.current]);
        const startTime = historyRef.current[0].t;
        const normalizedHistory = historyRef.current.map(pt => ({...pt, t: pt.t - startTime}));
        historyRef.current = normalizedHistory;
        const totalDurationMs = normalizedHistory[normalizedHistory.length - 1].t;
        setReplayDuration(totalDurationMs / 1000); 
        setReplayCurrentTime(0);
        replayOffsetTimeRef.current = 0;
        lastTimestampRef.current = performance.now();
        replayAnimFrameRef.current = requestAnimationFrame(replayLoop);
    };

    const replayLoop = (now: number) => {
        if (!isReplayingRef.current) return;
        if (!isReplayPausedRef.current) {
            const dtMs = now - lastTimestampRef.current;
            replayOffsetTimeRef.current += dtMs * replaySpeedRef.current;
        }
        lastTimestampRef.current = now;
        const totalDurationMs = historyRef.current[historyRef.current.length - 1].t;
        if (replayOffsetTimeRef.current >= totalDurationMs) {
            replayOffsetTimeRef.current = totalDurationMs;
            setIsReplayPaused(true);
        }
        updateReplayFrame(replayOffsetTimeRef.current);
        setReplayCurrentTime(replayOffsetTimeRef.current / 1000);
        replayAnimFrameRef.current = requestAnimationFrame(replayLoop);
    };

    const updateReplayFrame = (timeMs: number) => {
        let idx = 0;
        for (let i = 0; i < historyRef.current.length - 1; i++) {
            if (historyRef.current[i+1].t > timeMs) {
                idx = i;
                break;
            }
            idx = i;
        }
        const p1 = historyRef.current[idx];
        const p2 = historyRef.current[idx+1];
        if (!p2) {
            setPosition(p1.p);
            setOrientation(p1.q);
            setVelocity(p1.v);
            setAcceleration(p1.a);
            return;
        }
        const segmentDuration = p2.t - p1.t;
        const alpha = segmentDuration > 0 ? (timeMs - p1.t) / segmentDuration : 0;

        const pos = {
            x: p1.p.x + (p2.p.x - p1.p.x) * alpha,
            y: p1.p.y + (p2.p.y - p1.p.y) * alpha,
            z: p1.p.z + (p2.p.z - p1.p.z) * alpha,
        };
        const q1 = new THREE.Quaternion(p1.q.x, p1.q.y, p1.q.z, p1.q.w);
        const q2 = new THREE.Quaternion(p2.q.x, p2.q.y, p2.q.z, p2.q.w);
        q1.slerp(q2, alpha);
        setPosition(pos);
        setOrientation({ x: q1.x, y: q1.y, z: q1.z, w: q1.w });
    };

    const handleSeek = (timeSec: number) => {
        replayOffsetTimeRef.current = timeSec * 1000;
        updateReplayFrame(replayOffsetTimeRef.current);
    };

    const stopReplay = () => {
        setIsReplaying(false);
        cancelAnimationFrame(replayAnimFrameRef.current);
        setStatus('Ready');
        setRecordedPath([]); 
        setPosition({ x: positionRef.current.x, y: positionRef.current.y, z: positionRef.current.z });
    };

    const renderColorPicker = (label: string, colorKey: keyof PathConfig) => (
        <div className="flex justify-between items-center mb-2 bg-gray-800 p-2 rounded">
            <label className="text-gray-300 text-xs uppercase font-bold">{label}</label>
            <input 
                type="color" 
                value={pathConfig[colorKey] as string}
                onChange={(e) => setPathConfig(p => ({...p, [colorKey]: e.target.value}))}
                className="bg-transparent border-0 w-8 h-8 cursor-pointer"
            />
        </div>
    );

    return (
        <div className="relative w-full h-screen bg-gray-900 overflow-hidden font-sans select-none">
            {/* Layer 0: 3D View */}
            <div className="absolute inset-0 z-0">
                <Scene3D 
                    position={position} 
                    orientation={orientation} 
                    velocity={velocity} 
                    acceleration={acceleration}
                    isReplaying={isReplaying}
                    recordedPath={recordedPath}
                    pathSettings={pathConfig}
                    onClearPathSignal={clearSignal}
                />
            </div>
            
            {/* Layer 1: HUD */}
            <div className="absolute top-20 right-4 z-30 flex flex-col gap-2">
                 <button 
                    onClick={clearPath}
                    className="bg-gray-800/80 hover:bg-red-900/80 text-gray-200 p-3 rounded-full backdrop-blur border border-gray-600 shadow-lg transition-all hover:scale-110 group"
                    title="Clear Path"
                 >
                    <svg className="w-6 h-6 group-hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                 </button>
            </div>

            <div className="absolute top-0 left-0 w-full p-4 z-20 pointer-events-none">
                <div className="pointer-events-auto">
                    <Dashboard 
                        position={position} 
                        velocity={velocity} 
                        heading={heading} 
                        status={status} 
                        onSetNorth={handleSetNorth}
                        rotationSpeed={rotationSpeed}
                        force={instantForce}
                    />
                </div>
            </div>

            <div className="absolute bottom-0 left-0 w-full z-20">
                {isReplaying ? (
                     <ReplayControls 
                        duration={replayDuration}
                        currentTime={replayCurrentTime}
                        isPlaying={!isReplayPaused}
                        playbackSpeed={replaySpeed}
                        onTogglePlay={() => setIsReplayPaused(!isReplayPaused)}
                        onSeek={handleSeek}
                        onSpeedChange={setReplaySpeed}
                        onClose={stopReplay}
                     />
                ) : (
                    <Controls 
                        isTracking={isTracking}
                        isReplaying={isReplaying}
                        isCalibrated={isCalibrated}
                        hasHistory={historyRef.current.length > 0}
                        onStart={toggleTracking}
                        onCalibrate={startCalibrationWizard}
                        onStop={toggleTracking}
                        onReset={resetSystem}
                        onEnterReplay={startReplay}
                        onZero={handleZeroSensors}
                        permissionStatus={permissionStatus}
                        isSecureContext={isSecureContext}
                        status={status}
                        onOpenSettings={() => setShowSettings(true)}
                    />
                )}
            </div>

            {/* Layer 2: Modals */}
            {calibrationStep !== 'idle' && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="bg-gray-900 border border-cyan-500/30 p-8 rounded-2xl max-w-md w-full shadow-[0_0_50px_rgba(6,182,212,0.2)] text-center">
                        <div className="text-4xl mb-4">
                            {calibrationStep === 'floor_wait' && '⬇️'}
                            {calibrationStep === 'floor_measuring' && '⏳'}
                            {calibrationStep === 'vertical_intro' && '⬆️'}
                            {calibrationStep === 'vertical_measuring' && '📏'}
                            {calibrationStep === 'horizontal_intro' && '➡️'}
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">{status}</h2>
                        <p className="text-gray-400 mb-8 text-lg leading-relaxed">{calibrationMsg}</p>
                        
                        {calibrationStep === 'floor_wait' && (
                            <button onClick={startFloorMeasure} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-xl">Begin Zeroing</button>
                        )}
                        {calibrationStep === 'vertical_intro' && (
                            <button onClick={startVerticalMeasure} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-xl">Start Lift</button>
                        )}
                         {calibrationStep === 'vertical_measuring' && (
                            <>
                                <div className="text-3xl text-cyan-400 font-mono mb-4">{measuredDistance.toFixed(2)} m</div>
                                <button onClick={finishVerticalMeasure} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-xl">Done Lifting</button>
                            </>
                        )}
                        {calibrationStep === 'horizontal_intro' && (
                            <button onClick={startHorizontalMeasure} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-xl">Start Move</button>
                        )}
                         {calibrationStep === 'horizontal_measuring' && (
                            <>
                                <div className="text-3xl text-cyan-400 font-mono mb-4">{measuredDistance.toFixed(2)} m</div>
                                <button onClick={finishHorizontalMeasure} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-xl">Done Moving</button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {showSettings && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center sticky top-0 bg-gray-900 z-10">
                            <h2 className="text-xl font-bold text-white">Path Customization</h2>
                            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Mode Selection */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Direction Mode</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['axis', 'cardinal'] as DirectionMode[]).map(m => (
                                        <button 
                                            key={m}
                                            onClick={() => setPathConfig(p => ({...p, directionMode: m}))}
                                            className={`py-2 rounded-lg font-bold capitalize border ${pathConfig.directionMode === m ? 'bg-cyan-900/50 border-cyan-500 text-white' : 'bg-gray-800 border-transparent text-gray-400'}`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                             {/* Direction Colors */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-bold text-gray-500 uppercase">Direction Colors (Left Ribbon)</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {pathConfig.directionMode === 'axis' ? (
                                        <>
                                            {renderColorPicker("X Axis (Lateral)", "xColor")}
                                            {renderColorPicker("Y Axis (Vertical)", "yColor")}
                                            {renderColorPicker("Z Axis (Forward)", "zColor")}
                                        </>
                                    ) : (
                                        <>
                                            {renderColorPicker("North (-Z)", "nColor")}
                                            {renderColorPicker("South (+Z)", "sColor")}
                                            {renderColorPicker("East (+X)", "eColor")}
                                            {renderColorPicker("West (-X)", "wColor")}
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-gray-800 pt-4 space-y-3">
                                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Physics Mode</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['speed', 'accel'] as PhysicsMode[]).map(m => (
                                        <button 
                                            key={m}
                                            onClick={() => setPathConfig(p => ({...p, physicsMode: m}))}
                                            className={`py-2 rounded-lg font-bold capitalize border ${pathConfig.physicsMode === m ? 'bg-amber-900/50 border-amber-500 text-white' : 'bg-gray-800 border-transparent text-gray-400'}`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-sm font-bold text-gray-500 uppercase">Gradient Colors (Right Ribbon)</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {renderColorPicker("Low Intensity", "lowColor")}
                                    {renderColorPicker("High Intensity", "highColor")}
                                </div>
                            </div>

                            <div className="border-t border-gray-800 pt-4 space-y-3">
                                <h3 className="text-sm font-bold text-gray-400 uppercase">Style</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <label className="text-xs text-gray-500 font-bold">OPACITY</label>
                                            <span className="text-xs text-white">{pathConfig.opacity.toFixed(1)}</span>
                                        </div>
                                        <input 
                                            type="range" min="0.1" max="1" step="0.1" 
                                            value={pathConfig.opacity}
                                            onChange={(e) => setPathConfig(p => ({...p, opacity: parseFloat(e.target.value)}))}
                                            className="w-full"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <label className="text-xs text-gray-500 font-bold">WIDTH</label>
                                            <span className="text-xs text-white">{pathConfig.lineWidth}px</span>
                                        </div>
                                        <input 
                                            type="range" min="1" max="10" step="1" 
                                            value={pathConfig.lineWidth}
                                            onChange={(e) => setPathConfig(p => ({...p, lineWidth: parseInt(e.target.value)}))}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 pt-0">
                             <button onClick={() => { saveCalibration(); setShowSettings(false); }} className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200">Close & Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
