"use client";

import { useState, useEffect } from "react";
import SceneDesigner from "@/components/SceneDesigner";
import SplashScreen from "@/components/SplashScreen";
import TutorialOverlay from "@/components/TutorialOverlay";

export default function DesignerPage() {
  const [showSplash, setShowSplash] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);

  // Show tutorial when splash completes, we also need to ensure that the useEffect doesn't continusoly open the tutorial window
  useEffect(() => {
    if (!showSplash) {
      setShowTutorial(true);
    }
  }, [showSplash]);

  // Listen for 'H' key to show tutorial again
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "h" || e.key === "H") {
        if (!showTutorial) {
          setShowTutorial(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [showTutorial]);

  const handleTutorialComplete = () => {
    setShowTutorial(false);
  };

  return (
    <main style={{ height: "100vh", width: "100vw", overflow: "hidden" }}>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <SceneDesigner onShowTutorial={() => setShowTutorial(true)} />
      {showTutorial && <TutorialOverlay onComplete={handleTutorialComplete} />}
    </main>
  );
}

