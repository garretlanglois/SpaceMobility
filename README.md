# SpaceMobility

### Human-Centered Space Habitat Design
---

## Overview

As NASA moves toward decommissioning the ISS, future missions will rely on commercial and national space stations in Earth and lunar orbit.  
Designing these habitats means more than ensuring life support, it’s about creating spaces where astronauts can move efficiently and stay healthy.

---

## What It Is

**SpaceMobility** is a 3D web app built with **TypeScript** and **Three.js** that helps design and evaluate astronaut movement paths inside space habitats.

Using **NASA Open Data**, **3D models**, and **TLE orbital data**, the tool visualizes realistic environments and rates pathway designs for efficiency and comfort.

---

## How It Works

- Import or build a station model  
- Draw movement paths on a grid (X, Y, and Z directions)  
- Get a **Path Quality Score** based on NASA’s Task Load Index (TLX), accounting for workload, effort, and route complexity

---

## Why It Matters

SpaceMobility uses real data to guide human-centered space design.  
It helps reduce astronaut fatigue, improve safety, and support healthier long-duration missions.

---

## Run Locally

```bash
git clone https://github.com/[your-org]/spacemobility.git
cd spacemobility
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## License

MIT License
