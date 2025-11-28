import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from './types';
import { AudioService } from './services/audio';

// --- Types for MediaPipe global objects ---
declare global {
  interface Window {
    FaceMesh: any;
    Camera: any;
    drawConnectors: any;
    FACEMESH_TESSELATION: any;
    FACEMESH_RIGHT_EYE: any;
    FACEMESH_LEFT_EYE: any;
    FACEMESH_LIPS: any;
    FACEMESH_FACE_OVAL: any;
  }
}

const TIPS = [
  "Analyzing facial symmetry...",
  "Skin texture optimal.",
  "Checking dental alignment...",
  "Open your mouth and look at your eyes..."
];

const SCARE_IMAGE_URL = "https://images.voicy.network/Content/Pages/Images/f6ee7f2b-7e8a-49af-bfc8-b28a818a9141-small.png?auto=compress&auto=format&h=186&lossless=true";

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [systemStatus, setSystemStatus] = useState("System Standby");
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioService = useRef(new AudioService());
  
  // Logic Refs (to avoid stale closures in callbacks)
  const appStateRef = useRef(appState);
  const currentTipIndexRef = useRef(currentTipIndex);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    currentTipIndexRef.current = currentTipIndex;
  }, [currentTipIndex]);

  // Preload Assets
  useEffect(() => {
    const preload = async () => {
      const loadAudio = audioService.current.load();
      
      const loadImage = new Promise((resolve) => {
        const img = new Image();
        img.src = SCARE_IMAGE_URL;
        img.onload = resolve;
        img.onerror = resolve;
      });

      await Promise.all([loadAudio, loadImage]);

      setAssetsLoaded(true);
      setSystemStatus("Assets Ready");
    };
    preload();
  }, []);

  // Tip Rotation Logic - NOW DEPENDS ON CAMERA READY
  useEffect(() => {
    let interval: any;
    // Only start tips if mirror is active AND camera is actually sending frames
    if (appState === AppState.MIRROR_ACTIVE && isCameraReady) {
      interval = setInterval(() => {
        setCurrentTipIndex(prev => {
          // If we are at the last tip (the bait), stay there
          if (prev >= TIPS.length - 1) return prev;
          return prev + 1;
        });
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [appState, isCameraReady]);

  const triggerScare = useCallback(() => {
    if (appStateRef.current === AppState.SCARE_TRIGGERED) return;
    
    console.log("TRIGGERING SCARE");
    setAppState(AppState.SCARE_TRIGGERED);
    audioService.current.playScream();

    // Reset back to mirror after 3 seconds
    setTimeout(() => {
      setAppState(AppState.MIRROR_ACTIVE);
      setCurrentTipIndex(0);
    }, 3000);
  }, []);

  // --- MediaPipe Face Mesh Setup ---
  useEffect(() => {
    if (appState !== AppState.MIRROR_ACTIVE) return;
    
    // Safety check for MediaPipe loading
    if (!window.FaceMesh || !window.Camera) {
      console.error("MediaPipe not loaded yet");
      return;
    }

    let camera: any = null;
    let faceMesh: any = null;

    faceMesh = new window.FaceMesh({locateFile: (file: string) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }});

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results: any) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !results.image) return;

      // Draw video frame
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1); // Mirror effect
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        
        // CAMERA IS DEFINITELY WORKING NOW
        // Note: checking !isCameraReady checks the closed-over value (initial false)
        // This is fine as React state setters are stable and deduped
        if (!isCameraReady) setIsCameraReady(true);

        const landmarks = results.multiFaceLandmarks[0];

        // Draw the "Tech" Mesh
        if (appStateRef.current === AppState.MIRROR_ACTIVE) {
          window.drawConnectors(ctx, landmarks, window.FACEMESH_TESSELATION, 
            {color: '#00FF0011', lineWidth: 1});
          window.drawConnectors(ctx, landmarks, window.FACEMESH_RIGHT_EYE, 
            {color: '#00FF00', lineWidth: 1});
          window.drawConnectors(ctx, landmarks, window.FACEMESH_LEFT_EYE, 
            {color: '#00FF00', lineWidth: 1});
          window.drawConnectors(ctx, landmarks, window.FACEMESH_FACE_OVAL, 
            {color: '#00FF0055', lineWidth: 1});
        
          // Check for "Open Mouth" Trigger
          // Upper lip bottom: 13, Lower lip top: 14
          // Mouth corners: 61, 291
          const upperLip = landmarks[13];
          const lowerLip = landmarks[14];
          const leftCorner = landmarks[61];
          const rightCorner = landmarks[291];

          // Calculate vertical opening vs horizontal width
          const mouthHeight = Math.abs(upperLip.y - lowerLip.y);
          const mouthWidth = Math.abs(leftCorner.x - rightCorner.x);
          const ratio = mouthHeight / mouthWidth;

          // Threshold for open mouth
          if (ratio > 0.4) {
            // Only trigger if we are on the bait tip
            if (currentTipIndexRef.current === 3) {
               triggerScare();
            }
          }
        }
      }
      ctx.restore();
    });

    if (videoRef.current) {
      camera = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if (faceMesh) {
            await faceMesh.send({image: videoRef.current!});
          }
        },
        width: 1280,
        height: 720
      });
      camera.start();
    }
    
    return () => {
       setIsCameraReady(false); // Reset to force recalibration/loading state on next mount
       if (camera) camera.stop();
       if (faceMesh) faceMesh.close();
    };
  }, [appState, triggerScare]); // Removed isCameraReady to prevent loop

  const startApp = async () => {
    // Resume audio context on user interaction
    await audioService.current.resumeContext();
    
    setAppState(AppState.LOADING_TIPS);
    
    setTimeout(() => {
      setAppState(AppState.MIRROR_ACTIVE);
      setSystemStatus("Online - Visual Sensors Active");
    }, 1000);
  };

  return (
    <div className={`w-screen h-screen relative bg-black flex flex-col items-center justify-center overflow-hidden ${appState === AppState.SCARE_TRIGGERED ? 'scare-anim' : ''}`}>
      
      {/* Hidden Video Source for MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted></video>

      {/* Main Display Canvas */}
      <canvas 
        ref={canvasRef} 
        width={1280} 
        height={720}
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-100
          ${appState === AppState.SCARE_TRIGGERED ? 'filter invert hue-rotate-90 brightness-150 contrast-200' : ''}
        `}
      />

      {/* SETUP SCREEN */}
      {appState === AppState.SETUP && (
        <div className="z-50 text-center">
          <h1 className="text-4xl font-mono text-cyan-400 mb-8 animate-pulse">SMART MIRROR v2.0</h1>
          <button 
            onClick={startApp}
            disabled={!assetsLoaded}
            className={`px-8 py-4 border font-mono rounded transition-colors ${
              assetsLoaded 
                ? 'bg-cyan-900 border-cyan-500 text-cyan-100 hover:bg-cyan-800' 
                : 'bg-gray-900 border-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {assetsLoaded ? "INITIALIZE SYSTEM" : "LOADING RESOURCES..."}
          </button>
        </div>
      )}

      {/* MIRROR ACTIVE UI */}
      {appState === AppState.MIRROR_ACTIVE && (
        <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="font-mono text-cyan-500 text-sm">
              <div className="text-4xl text-white mb-2">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
              <div>{new Date().toLocaleDateString()}</div>
              <div className="mt-2 text-xs opacity-75">FACE_TRACKING: {isCameraReady ? 'ACTIVE' : 'CALIBRATING...'}</div>
              <div className="text-xs opacity-75">MOUTH_SENSOR: {isCameraReady ? 'ACTIVE' : 'PENDING'}</div>
            </div>
            <div className="font-mono text-right text-xs text-green-500 border border-green-500 px-2 py-1 rounded bg-green-900/20">
              {systemStatus}
            </div>
          </div>

          {/* Smart Tips - Bottom Center */}
          <div className="w-full flex justify-center mb-12">
            {!isCameraReady ? (
               <div className="font-mono text-cyan-500 animate-pulse bg-black/0 px-6 py-3 rounded">
                 CALIBRATING OPTICAL SENSORS...
               </div>
            ) : (
              <div className={`
                font-sans text-2xl font-light tracking-wide px-6 py-3 rounded backdrop-blur-sm
                transition-all duration-500 transform
                ${currentTipIndex === 3 ? 'text-red-600 bg-black/0 scale-110 animate-pulse font-bold' : 'text-cyan-100 bg-black/40'}
              `}>
                {TIPS[currentTipIndex]}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCARE OVERLAY */}
      {appState === AppState.SCARE_TRIGGERED && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
          <img 
            src={SCARE_IMAGE_URL} 
            alt="scare" 
            className="w-full h-full object-cover opacity-80 mix-blend-hard-light"
          />
          <div className="absolute inset-0 bg-red-900/30 mix-blend-overlay"></div>
        </div>
      )}
    </div>
  );
}