# SpaceMobility – 3D Grid Demo

Interactive 3D grid of points built with Next.js, TypeScript, and Three.js.

## Features

- Orbit with mouse drag, zoom with wheel
- 11×11×11 grid of points (instanced spheres)
- Click two points to draw a line between them
- UI to scale the scene and clear drawn lines

## Getting Started

Prereqs: Node.js 18+ and pnpm or npm.

Install dependencies:

```bash
npm install
# or
pnpm install
```

Run the dev server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## Project Structure

- `app/page.tsx`: Renders the `ThreeGrid` component
- `components/ThreeGrid.tsx`: Three.js scene setup, controls, raycasting, line drawing, scaling
- `styles/globals.css`: Global styles

## Notes

- Grid uses an `InstancedMesh` for performance
- Scaling applies to the `worldGroup` for true 3D scaling
