
import React, { useEffect, useRef } from 'react';
import { Vector3D, Quaternion, HistoryPoint, PathConfig, PhysicsConfig } from '../types';

declare const THREE: any;

interface Scene3DProps {
  position: Vector3D;
  orientation: Quaternion;
  velocity: Vector3D;
  acceleration: Vector3D;
  ghostPosition?: Vector3D;
  physicsConfig?: PhysicsConfig;
  isReplaying?: boolean;
  recordedPath?: HistoryPoint[]; 
  pathSettings: PathConfig;
  onClearPathSignal?: number; // Prop to trigger internal clear
}

// Helper to mix colors
const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : { r: 0, g: 0, b: 0 };
};

const Scene3D: React.FC<Scene3DProps> = ({ 
    position, 
    orientation, 
    velocity, 
    acceleration,
    ghostPosition,
    physicsConfig,
    isReplaying = false, 
    recordedPath = [],
    pathSettings,
    onClearPathSignal
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  // ThreeJS References
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  
  // Scene Objects
  const phoneGroupRef = useRef<any>(null);
  const ghostPhoneRef = useRef<any>(null);
  const velocityArrowRef = useRef<any>(null);
  const projectorsRef = useRef<any>(null);
  
  // Trajectories (Now Meshes/Ribbons)
  const trajectoryDataRef = useRef<{pos: any, v: any, a: any}[]>([]); 
  const trajectoryMeshRef = useRef<any>(null);   // Live Ribbon
  const recordedMeshRef = useRef<any>(null);     // Replay Ribbon
  
  const frameIdRef = useRef<number>(0);
  const isInitializedRef = useRef<boolean>(false);
  const lastRibbonUpdateRef = useRef<number>(0);

  // --- DYNAMIC COLOR LOGIC (Dual Output) ---
  // Returns [ColorLeft, ColorRight] (r,g,b arrays)
  const getDualPathColors = (vel: Vector3D, acc: Vector3D): [number[], number[]] => {
      const cfg = pathSettings;

      // --- LEFT SIDE: DIRECTION (Axis or Cardinal) ---
      let leftColor = [0,0,0];
      if (cfg.directionMode === 'axis') {
          const rgbX = hexToRgb(cfg.xColor);
          const rgbY = hexToRgb(cfg.yColor);
          const rgbZ = hexToRgb(cfg.zColor);
          const total = Math.abs(vel.x) + Math.abs(vel.y) + Math.abs(vel.z) + 0.001;
          const wx = Math.abs(vel.x) / total;
          const wy = Math.abs(vel.y) / total;
          const wz = Math.abs(vel.z) / total;
          leftColor = [
              wx * rgbX.r + wy * rgbY.r + wz * rgbZ.r,
              wx * rgbX.g + wy * rgbY.g + wz * rgbZ.g,
              wx * rgbX.b + wy * rgbY.b + wz * rgbZ.b
          ];
      } else { // Cardinal
          const rgbN = hexToRgb(cfg.nColor); // -Z
          const rgbS = hexToRgb(cfg.sColor); // +Z
          const rgbE = hexToRgb(cfg.eColor); // +X
          const rgbW = hexToRgb(cfg.wColor); // -X
          const mag = Math.sqrt(vel.x**2 + vel.z**2) + 0.001;
          let r=0, g=0, b=0;
          // Z Component
          const zWeight = Math.abs(vel.z) / mag;
          if (vel.z < 0) { r += rgbN.r * zWeight; g += rgbN.g * zWeight; b += rgbN.b * zWeight; }
          else { r += rgbS.r * zWeight; g += rgbS.g * zWeight; b += rgbS.b * zWeight; }
          // X Component
          const xWeight = Math.abs(vel.x) / mag;
          if (vel.x > 0) { r += rgbE.r * xWeight; g += rgbE.g * xWeight; b += rgbE.b * xWeight; }
          else { r += rgbW.r * xWeight; g += rgbW.g * xWeight; b += rgbW.b * xWeight; }
          leftColor = [r,g,b];
      }

      // --- RIGHT SIDE: PHYSICS (Speed or Accel) ---
      let rightColor = [0,0,0];
      let val = 0;
      if (cfg.physicsMode === 'accel') {
          val = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
      } else {
          val = Math.sqrt(vel.x**2 + vel.y**2 + vel.z**2);
      }
      // Heatmap gradient
      const t = Math.min(val / 2.0, 1.0); 
      const c1 = hexToRgb(cfg.lowColor);
      const c2 = hexToRgb(cfg.highColor);
      rightColor = [
          c1.r + (c2.r - c1.r) * t,
          c1.g + (c2.g - c1.g) * t,
          c1.b + (c2.b - c1.b) * t
      ];

      return [leftColor, rightColor];
  };

  // --- Clear Path Signal Handler ---
  useEffect(() => {
      if (onClearPathSignal && trajectoryDataRef.current) {
          trajectoryDataRef.current = [];
          if (trajectoryMeshRef.current) {
              trajectoryMeshRef.current.geometry.setDrawRange(0, 0);
          }
      }
  }, [onClearPathSignal]);

  // --- Initialization ---
  useEffect(() => {
    let initInterval: any;

    const initScene = () => {
        if (typeof THREE === 'undefined') return false;
        if (!mountRef.current) return false;
        if (isInitializedRef.current) return true;

        try {
            const width = mountRef.current.clientWidth;
            const height = mountRef.current.clientHeight || 400;

            // Scene
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0f172a); 
            scene.fog = new THREE.FogExp2(0x0f172a, 0.015);
            sceneRef.current = scene;

            // Camera
            const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
            camera.position.set(0, 12, 8); 
            camera.lookAt(0,0,0);
            cameraRef.current = camera;

            // Renderer
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            mountRef.current.appendChild(renderer.domElement);
            rendererRef.current = renderer;

            // Orbit Controls
            if (THREE.OrbitControls) {
                const controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;
                controls.maxDistance = 100;
                controlsRef.current = controls;
            }

            // Lights
            const ambient = new THREE.AmbientLight(0x404040, 2);
            scene.add(ambient);
            const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
            dirLight.position.set(10, 20, 10);
            dirLight.castShadow = true;
            scene.add(dirLight);

            // Grid
            const grid = new THREE.GridHelper(50, 50, 0x334155, 0x1e293b);
            grid.position.y = -0.01;
            scene.add(grid);
            
            // Axis Markers
            const axesHelper = new THREE.AxesHelper(2);
            scene.add(axesHelper);

            // Labels
            const axisLabels = [
                { text: "N", color: "#ff4444", pos: [0, 0.5, -11] },
                { text: "E", color: "#44ff44", pos: [11, 0.5, 0] },
                { text: "S", color: "#4444ff", pos: [0, 0.5, 11] },
                { text: "W", color: "#ffff44", pos: [-11, 0.5, 0] }
            ];
            axisLabels.forEach(item => {
                const lbCanvas = document.createElement('canvas');
                const lbCtx = lbCanvas.getContext('2d');
                if (lbCtx) {
                    lbCanvas.width = 64; lbCanvas.height = 64;
                    lbCtx.fillStyle = item.color;
                    lbCtx.font = 'bold 40px sans-serif';
                    lbCtx.textAlign = 'center'; lbCtx.textBaseline = 'middle';
                    lbCtx.fillText(item.text, 32, 32);
                    const tex = new THREE.CanvasTexture(lbCanvas);
                    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
                    sprite.position.set(item.pos[0] as number, item.pos[1] as number, item.pos[2] as number);
                    sprite.scale.set(2, 2, 1);
                    scene.add(sprite);
                }
            });

            // --- Live Trajectory (Ribbon Mesh) ---
            // Max 10000 steps = 20000 vertices
            const maxSteps = 10000;
            const maxVerts = maxSteps * 2;
            
            const ribbonGeo = new THREE.BufferGeometry();
            const ribPos = new Float32Array(maxVerts * 3);
            const ribCol = new Float32Array(maxVerts * 3);
            const ribIndices = [];

            // Generate Triangle Strip Indices
            for (let i = 0; i < maxSteps - 1; i++) {
                const v = i * 2;
                ribIndices.push(v, v+1, v+2);
                ribIndices.push(v+1, v+3, v+2);
            }

            ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3));
            ribbonGeo.setAttribute('color', new THREE.BufferAttribute(ribCol, 3));
            ribbonGeo.setIndex(ribIndices);
            ribbonGeo.setDrawRange(0, 0);

            const ribbonMat = new THREE.MeshBasicMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8
            });

            const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
            ribbonMesh.frustumCulled = false;
            scene.add(ribbonMesh);
            trajectoryMeshRef.current = ribbonMesh;

            // --- Recorded Path (Replay Ribbon) ---
            const recGeo = new THREE.BufferGeometry();
            // Initial empty
            const recMat = new THREE.MeshBasicMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8
            });
            const recMesh = new THREE.Mesh(recGeo, recMat);
            recMesh.frustumCulled = false;
            recMesh.visible = false;
            scene.add(recMesh);
            recordedMeshRef.current = recMesh;

            // --- Projectors ---
            const projGeo = new THREE.BufferGeometry();
            const projPos = new Float32Array(6 * 3);
            projGeo.setAttribute('position', new THREE.BufferAttribute(projPos, 3));
            const projColors = new Float32Array(6 * 3);
            const fill = (idx: number, r:number, g:number, b:number) => {
                projColors[idx]=r; projColors[idx+1]=g; projColors[idx+2]=b;
            }
            fill(0, 1, 0.2, 0.2); fill(3, 1, 0.2, 0.2); // X
            fill(6, 0.2, 1, 0.2); fill(9, 0.2, 1, 0.2); // Y
            fill(12, 0.2, 0.2, 1); fill(15, 0.2, 0.2, 1); // Z

            projGeo.setAttribute('color', new THREE.BufferAttribute(projColors, 3));
            const projMat = new THREE.LineDashedMaterial({ vertexColors: true, dashSize: 0.5, gapSize: 0.2, scale: 1 });
            const projectors = new THREE.LineSegments(projGeo, projMat);
            projectors.computeLineDistances(); 
            scene.add(projectors);
            projectorsRef.current = projectors;

            // --- Phone Object ---
            const phoneGroup = new THREE.Group();
            scene.add(phoneGroup);
            phoneGroupRef.current = phoneGroup;

            const visualGroup = new THREE.Group();
            phoneGroup.add(visualGroup);

            const phoneGeo = new THREE.BoxGeometry(0.7, 1.4, 0.08); 
            const phoneMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.2, metalness: 0.5 });
            const phoneMesh = new THREE.Mesh(phoneGeo, phoneMat);
            phoneMesh.castShadow = true;
            visualGroup.add(phoneMesh);

            // --- Ghost Phone Object ---
            const ghostGroup = new THREE.Group();
            scene.add(ghostGroup);
            ghostPhoneRef.current = ghostGroup;
            
            const ghostVisualGroup = new THREE.Group();
            ghostGroup.add(ghostVisualGroup);
            
            const ghostMat = new THREE.MeshStandardMaterial({ 
                color: 0xef4444, 
                roughness: 0.2, 
                metalness: 0.5,
                transparent: true,
                opacity: 0.5
            });
            const ghostMesh = new THREE.Mesh(phoneGeo, ghostMat);
            ghostVisualGroup.add(ghostMesh);
            
            const ghostScreenMat = new THREE.MeshBasicMaterial({ 
                color: 0x111111,
                transparent: true,
                opacity: 0.5
            });
            const ghostScreen = new THREE.Mesh(screenGeo, ghostScreenMat);
            ghostScreen.position.z = 0.041;
            ghostVisualGroup.add(ghostScreen);
            
            ghostGroup.visible = false;

            const screenGeo = new THREE.PlaneGeometry(0.65, 1.35);
            const screenMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
            const screen = new THREE.Mesh(screenGeo, screenMat);
            screen.position.z = 0.041; 
            visualGroup.add(screen);

            const notchGeo = new THREE.BoxGeometry(0.2, 0.05, 0.01);
            const notchMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
            const notch = new THREE.Mesh(notchGeo, notchMat);
            notch.position.set(0, 0.65, 0.042); 
            visualGroup.add(notch);

            const vArrow = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0), 1, 0xffff00);
            phoneGroup.add(vArrow); 
            velocityArrowRef.current = vArrow;

            // --- Loop ---
            const animate = () => {
                frameIdRef.current = requestAnimationFrame(animate);
                if(controlsRef.current) controlsRef.current.update();
                if(rendererRef.current && sceneRef.current && cameraRef.current) {
                    rendererRef.current.render(sceneRef.current, cameraRef.current);
                }
            };
            animate();
            isInitializedRef.current = true;
            return true;

        } catch (e) {
            console.error("Init Error", e);
            return false;
        }
    };

    if (!initScene()) {
        initInterval = setInterval(() => {
            if(initScene()) clearInterval(initInterval);
        }, 100);
    }

    const handleResize = () => {
        if(mountRef.current && rendererRef.current && cameraRef.current) {
            const w = mountRef.current.clientWidth;
            const h = mountRef.current.clientHeight;
            rendererRef.current.setSize(w, h);
            cameraRef.current.aspect = w/h;
            cameraRef.current.updateProjectionMatrix();
        }
    };

    if(mountRef.current) window.addEventListener('resize', handleResize);

    return () => {
        if(initInterval) clearInterval(initInterval);
        window.removeEventListener('resize', handleResize);
        if(frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
        if(rendererRef.current) rendererRef.current.dispose();
        isInitializedRef.current = false;
    };
  }, []);

  // --- Helper to Update Ribbon Geometry ---
  const updateRibbonGeometry = (mesh: any, points: {pos: any, v: any, a: any}[], isStatic = false) => {
      if (!mesh || points.length < 2) return;

      const width = (pathSettings.lineWidth || 3) * 0.05; // Scale logical width to world units roughly
      const geo = mesh.geometry;
      const count = points.length;
      const vertCount = count * 2;
      
      // Ensure buffer size (if static, resize. If dynamic, use pre-allocated)
      if (isStatic) {
          const positions = new Float32Array(vertCount * 3);
          const colors = new Float32Array(vertCount * 3);
          const indices = [];
          
          // Build Ribbon
          for (let i = 0; i < count; i++) {
              const curr = points[i];
              const next = points[Math.min(i + 1, count - 1)];
              const prev = points[Math.max(i - 1, 0)];

              // Determine Direction (Tangent)
              // Simple approach: use velocity or difference
              const p = new THREE.Vector3(curr.pos.x, curr.pos.y, curr.pos.z);
              let dir = new THREE.Vector3();
              
              if (i < count - 1) {
                 const nP = new THREE.Vector3(next.pos.x, next.pos.y, next.pos.z);
                 dir.subVectors(nP, p).normalize();
              } else {
                 const pP = new THREE.Vector3(prev.pos.x, prev.pos.y, prev.pos.z);
                 dir.subVectors(p, pP).normalize();
              }
              
              // Fallback if stationary
              if (dir.lengthSq() < 0.001) dir.set(0,0,1);

              // Up Vector (World Y is usually fine for map)
              const up = new THREE.Vector3(0, 1, 0);
              // Calculate Right Vector
              const right = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(width / 2);

              // Vertices
              const vLeft = p.clone().sub(right);
              const vRight = p.clone().add(right);

              // Colors
              const [colL, colR] = getDualPathColors(curr.v, curr.a);

              // Set Buffer
              const idx = i * 2;
              
              positions[idx*3] = vLeft.x; positions[idx*3+1] = vLeft.y; positions[idx*3+2] = vLeft.z;
              positions[(idx+1)*3] = vRight.x; positions[(idx+1)*3+1] = vRight.y; positions[(idx+1)*3+2] = vRight.z;

              colors[idx*3] = colL[0]; colors[idx*3+1] = colL[1]; colors[idx*3+2] = colL[2];
              colors[(idx+1)*3] = colR[0]; colors[(idx+1)*3+1] = colR[1]; colors[(idx+1)*3+2] = colR[2];

              // Indices
              if (i < count - 1) {
                  indices.push(idx, idx+1, idx+2);
                  indices.push(idx+1, idx+3, idx+2);
              }
          }

          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          geo.setIndex(indices);
          geo.computeVertexNormals();

      } else {
          // Dynamic Update (Live)
          // Assume geo has large buffers
          const posArr = geo.attributes.position.array;
          const colArr = geo.attributes.color.array;
          
          // Update only the new tail? 
          // For simplicity/correctness with smoothing, we might redraw the active segment
          // But to save perf, let's redraw all active points for now (10k is cheap for JS/WebGL)
          
          for (let i = 0; i < count; i++) {
              const curr = points[i];
              const next = points[Math.min(i + 1, count - 1)];
              const prev = points[Math.max(i - 1, 0)];

              const p = curr.pos; // Vector3 (stored in ref)
              let dir = new THREE.Vector3();
              
              if (i < count - 1) {
                  dir.subVectors(next.pos, p).normalize();
              } else if (i > 0) {
                  dir.subVectors(p, prev.pos).normalize();
              } else {
                  dir.set(0,0,1); // Default
              }
              if (dir.lengthSq() < 0.001) dir.set(0,0,1);

              const up = new THREE.Vector3(0, 1, 0);
              const right = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(width / 2);
              
              const vLeft = p.clone().sub(right);
              const vRight = p.clone().add(right);

              const [colL, colR] = getDualPathColors(curr.v, curr.a);

              const idx = i * 2;
              
              posArr[idx*3] = vLeft.x; posArr[idx*3+1] = vLeft.y; posArr[idx*3+2] = vLeft.z;
              posArr[(idx+1)*3] = vRight.x; posArr[(idx+1)*3+1] = vRight.y; posArr[(idx+1)*3+2] = vRight.z;

              colArr[idx*3] = colL[0]; colArr[idx*3+1] = colL[1]; colArr[idx*3+2] = colL[2];
              colArr[(idx+1)*3] = colR[0]; colArr[(idx+1)*3+1] = colR[1]; colArr[(idx+1)*3+2] = colR[2];
          }

          geo.setDrawRange(0, (count - 1) * 6); // 6 indices per quad
          geo.attributes.position.needsUpdate = true;
          geo.attributes.color.needsUpdate = true;
      }
  };


  // --- Replay Static Mesh Logic ---
  useEffect(() => {
    if (!recordedMeshRef.current || typeof THREE === 'undefined') return;

    if (isReplaying && recordedPath.length > 0) {
        // 1. Hide Live Trail STRICTLY
        if (trajectoryMeshRef.current) trajectoryMeshRef.current.visible = false;

        // 2. Generate Static Ribbon for Replay
        // Map HistoryPoint to our internal format
        const ribbonPoints = recordedPath.map(pt => ({
            pos: pt.p, // HistoryPoint.p is Vector3D interface, we need THREE.Vector3? No, handle in updateRibbon
            v: pt.v,
            a: pt.a
        }));

        // Ensure they are consistent
        updateRibbonGeometry(recordedMeshRef.current, ribbonPoints as any, true);
        recordedMeshRef.current.visible = true;
        recordedMeshRef.current.material.opacity = pathSettings.opacity;

    } else {
        recordedMeshRef.current.visible = false;
        // Show Live Trail if not replaying
        if (trajectoryMeshRef.current) trajectoryMeshRef.current.visible = true;
    }

  }, [isReplaying, recordedPath, pathSettings]);

  // --- Live Updates & Ribbon Logic ---
  useEffect(() => {
      if (typeof THREE === 'undefined' || !phoneGroupRef.current) return;

      // Position & Orientation (Same for Live and Replay - App.tsx handles the source of truth)
      phoneGroupRef.current.position.set(position.x, position.y, position.z);
      phoneGroupRef.current.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);

      // Update phone dimensions if physics config is provided
      if (physicsConfig && physicsConfig.dimensions) {
          const { width, height, depth } = physicsConfig.dimensions;
          const visualGroup = phoneGroupRef.current.children[0];
          if (visualGroup && visualGroup.children.length > 0) {
              const phoneMesh = visualGroup.children[0];
              phoneMesh.scale.set(width / 0.7, height / 1.4, depth / 0.08); // Scale relative to default
              
              if (visualGroup.children.length > 1) {
                   const screen = visualGroup.children[1];
                   screen.scale.set(width / 0.7, height / 1.4, 1);
                   screen.position.z = (depth / 2) + 0.001;
              }
          }
      }

      if (ghostPhoneRef.current) {
          if (ghostPosition) {
              ghostPhoneRef.current.visible = true;
              ghostPhoneRef.current.position.set(ghostPosition.x, ghostPosition.y, ghostPosition.z);
              ghostPhoneRef.current.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
              
              // Update ghost dimensions
              if (physicsConfig && physicsConfig.dimensions) {
                  const { width, height, depth } = physicsConfig.dimensions;
                  const ghostVisualGroup = ghostPhoneRef.current.children[0];
                  if (ghostVisualGroup && ghostVisualGroup.children.length > 0) {
                      const ghostMesh = ghostVisualGroup.children[0];
                      ghostMesh.scale.set(width / 0.7, height / 1.4, depth / 0.08);
                      
                      if (ghostVisualGroup.children.length > 1) {
                           const ghostScreen = ghostVisualGroup.children[1];
                           ghostScreen.scale.set(width / 0.7, height / 1.4, 1);
                           ghostScreen.position.z = (depth / 2) + 0.001;
                      }
                  }
              }
          } else {
              ghostPhoneRef.current.visible = false;
          }
      }

      // Camera tracking
      if(controlsRef.current) {
          const target = new THREE.Vector3(position.x, position.y, position.z);
          controlsRef.current.target.lerp(target, 0.1); 
      }

      // Projectors
      if (projectorsRef.current) {
          const positions = projectorsRef.current.geometry.attributes.position.array;
          positions[0] = 0; positions[1] = position.y; positions[2] = position.z;
          positions[3] = position.x; positions[4] = position.y; positions[5] = position.z;
          positions[6] = position.x; positions[7] = 0; positions[8] = position.z;
          positions[9] = position.x; positions[10] = position.y; positions[11] = position.z;
          positions[12] = position.x; positions[13] = position.y; positions[14] = 0;
          positions[15] = position.x; positions[16] = position.y; positions[17] = position.z;
          projectorsRef.current.geometry.attributes.position.needsUpdate = true;
          projectorsRef.current.computeLineDistances(); 
      }

      // Velocity Arrow
      if(velocityArrowRef.current) {
          const speed = Math.sqrt(velocity.x**2 + velocity.y**2 + velocity.z**2);
          if(speed > 0.05) {
              velocityArrowRef.current.visible = true;
              const vWorld = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
              const invQ = phoneGroupRef.current.quaternion.clone().invert();
              const vLocal = vWorld.clone().applyQuaternion(invQ);
              velocityArrowRef.current.setDirection(vLocal.normalize());
              velocityArrowRef.current.setLength(Math.min(speed * 2, 5));
          } else {
              velocityArrowRef.current.visible = false;
          }
      }

      // --- Live Ribbon Update ---
      if(!isReplaying && trajectoryMeshRef.current) {
          const curPt = new THREE.Vector3(position.x, position.y, position.z);
          const lastPtData = trajectoryDataRef.current[trajectoryDataRef.current.length - 1];
          let shouldAdd = false;

          // Only add points if moved or empty
          if (!lastPtData) {
              shouldAdd = true;
          } else {
              if (lastPtData.pos.distanceToSquared(curPt) > 0.0005) {
                  shouldAdd = true;
              }
          }

          if(shouldAdd) {
              trajectoryDataRef.current.push({ pos: curPt, v: velocity, a: acceleration });
              if (trajectoryDataRef.current.length > 10000) trajectoryDataRef.current.shift();
              
              // Throttle mesh updates slightly for performance if needed, but 60fps is fine usually
              updateRibbonGeometry(trajectoryMeshRef.current, trajectoryDataRef.current, false);
          }
          
          // Apply material updates (opacity etc)
          trajectoryMeshRef.current.material.opacity = pathSettings.opacity;
      }

  }, [position, orientation, velocity, acceleration, isReplaying, pathSettings]);


  // --- Dynamic Legend Component ---
  const renderLegend = () => {
      const cfg = pathSettings;
      
      return (
          <div className="absolute bottom-24 left-4 bg-gray-900/90 backdrop-blur p-4 rounded-xl border border-gray-700 shadow-lg pointer-events-none flex flex-col gap-4">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-700 pb-1">Path Ribbon Coding</div>
              
              {/* Left Side: Direction */}
              <div>
                  <div className="text-xs font-bold text-white mb-1">Left: Direction ({cfg.directionMode})</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {cfg.directionMode === 'axis' ? (
                          <>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: cfg.xColor}}></div><span className="text-[10px] text-gray-300">X (Lateral)</span></div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: cfg.yColor}}></div><span className="text-[10px] text-gray-300">Y (Vertical)</span></div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: cfg.zColor}}></div><span className="text-[10px] text-gray-300">Z (Forward)</span></div>
                          </>
                      ) : (
                          <>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: cfg.nColor}}></div><span className="text-[10px] text-gray-300">North</span></div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: cfg.sColor}}></div><span className="text-[10px] text-gray-300">South</span></div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: cfg.eColor}}></div><span className="text-[10px] text-gray-300">East</span></div>
                              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: cfg.wColor}}></div><span className="text-[10px] text-gray-300">West</span></div>
                          </>
                      )}
                  </div>
              </div>

              {/* Right Side: Physics */}
              <div>
                   <div className="text-xs font-bold text-white mb-1">Right: Heat ({cfg.physicsMode})</div>
                   <div className="flex items-center gap-2 mt-1">
                       <span className="text-[10px] text-gray-400">Low</span>
                       <div className="h-2 w-24 rounded bg-gradient-to-r from-transparent to-transparent flex-grow" 
                            style={{background: `linear-gradient(to right, ${cfg.lowColor}, ${cfg.highColor})`}}></div>
                       <span className="text-[10px] text-gray-400">High</span>
                   </div>
              </div>
          </div>
      );
  };

  return (
      <div ref={mountRef} className="w-full h-full relative">
          {renderLegend()}
      </div>
  );
};

export default Scene3D;
