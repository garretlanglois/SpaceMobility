"use client";

import { useState, useEffect } from "react";

//Chat was consulted for helping me design this tutorial overlay, it is not too complex howeevr.

interface TutorialOverlayProps {
  onComplete: () => void;
}

export default function TutorialOverlay({ onComplete }: TutorialOverlayProps) {
  const [visible, setVisible] = useState(true);

  //Handle the closing of the tutorial overlay
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape" && visible) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [visible]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onComplete, 300);
  };

  if (!visible) return null;

  //ChatGPT was consulted for the CSS code to save time
  //Future iterations of the design would likely use Tailwind CSS to improve the design
  return (
    <>
      {/* Dark overlay */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(0, 0, 0, 0.85)",
          zIndex: 1000,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease"
        }}
        onClick={handleClose}
      />

      {/* Tutorial popup itself */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1002,
          background: "#000",
          border: "2px solid #fff",
          padding: "24px 28px",
          maxWidth: "600px",
          maxHeight: "85vh",
          overflowY: "auto",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "28px",
            height: "28px",
            background: "transparent",
            border: "1px solid #fff",
            color: "#fff",
            fontSize: "18px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
            padding: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#fff";
            e.currentTarget.style.color = "#000";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#fff";
          }}
        >
          ×
        </button>

        {/* Title */}
        <h1 style={{
          margin: "0 0 8px 0",
          fontSize: "20px",
          fontWeight: "bold",
          color: "#fff",
          letterSpacing: "0.05em",
          textTransform: "uppercase"
        }}>
          SpaceMobility
        </h1>

        <p style={{
          margin: "0 0 20px 0",
          fontSize: "12px",
          color: "#999",
          lineHeight: "1.5",
          letterSpacing: "0.05em"
        }}>
          Space Station Route Designer
        </p>

        {/* Instructions list */}
        <div style={{ color: "#ccc", fontSize: "13px", lineHeight: "1.6" }}>
          <h3 style={{ 
            margin: "0 0 10px 0", 
            fontSize: "14px", 
            fontWeight: "bold", 
            color: "#fff",
            opacity: 0.9
          }}>
            Controls:
          </h3>

          <ol style={{ margin: "0 0 16px 0", paddingLeft: "24px" }}>
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#fff" }}>Import Your Space Station:</strong><br />
              Click "IMPORT 3D MODEL" to upload a GLTF/GLB file, or use "+ Add Module" to create a simple station module.
            </li>
            
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#fff" }}>Navigate 3D Space:</strong><br />
              • Left click + drag to rotate view<br />
              • Right click + drag to pan<br />
              • Scroll wheel to zoom
            </li>
            
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#fff" }}>Use Y-Plane Selector:</strong><br />
              Use the slider on the left to move between vertical layers of your station.
            </li>
            
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#fff" }}>Draw Your Path:</strong><br />
              Click on white grid points to create waypoints. Lines will connect consecutive points to form the astronaut's route.
            </li>
            
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#fff" }}>Edit Line Segments:</strong><br />
              Click any line to select it, then use Scene Controls to make it curved, set route type (handrail/free drift/tethered), and add task details.
            </li>
            
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#fff" }}>Monitor Path Quality:</strong><br />
              Your path is evaluated in real-time using NASA Task Load Index principles. Aim for scores 80-100 for optimal routes.
            </li>
            
            <li style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#fff" }}>Adjust Model:</strong><br />
              Use Model Controls to scale, rotate, position, and slice your 3D model to align with the grid.
            </li>
          </ol>

          <div style={{
            background: "rgba(255,255,255,0.05)",
            padding: "10px",
            border: "1px solid rgba(255,255,255,0.2)",
            marginTop: "14px"
          }}>
            <p style={{ margin: 0, fontSize: "11px", color: "#999", opacity: 0.85 }}>
              Press <kbd style={{
                background: "transparent",
                padding: "2px 6px",
                border: "1px solid #666",
                fontFamily: "monospace",
                fontSize: "11px",
                color: "#fff"
              }}>H</kbd> anytime to see this guide again.
            </p>
          </div>
        </div>

        {/* Get Started button */}
        <button
          onClick={handleClose}
          style={{
            width: "100%",
            marginTop: "20px",
            background: "#fff",
            border: "1px solid #fff",
            color: "#000",
            padding: "10px 24px",
            fontSize: "13px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            fontWeight: "bold",
            letterSpacing: "0.05em"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#fff";
            e.currentTarget.style.color = "#000";
          }}
        >
          START
        </button>

        {/* Keyboard hint */}
        <div style={{
          marginTop: "10px",
          fontSize: "10px",
          color: "#666",
          textAlign: "center",
          letterSpacing: "0.05em"
        }}>
          ESC to close
        </div>
      </div>
    </>
  );
}