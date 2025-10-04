import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>
      <h1>SpaceMobility – Space Station Route Designer</h1>
      <p>
        We’re SpaceMobility from Toronto, Ontario. Our team is multidisciplinary and
        passionate about Human Space Flight and astronaut safety. This app lets you design
        and evaluate astronaut routes for next-generation space stations.
      </p>
      <h2>Demo</h2>
      <p>[Insert video demonstration]</p>
      <h2>Get Started</h2>
      <ul>
        <li>
          <Link href="/designer">Open the 3D Designer</Link>
        </li>
      </ul>
    </main>
  );
}

