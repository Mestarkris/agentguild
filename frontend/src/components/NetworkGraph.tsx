'use client';

import { useRef, useEffect } from 'react';

const ACCENT = '#ef9f27';
const ACCENT_DIM = 'rgba(239, 159, 39, 0.18)';
const SURFACE = '#0d0d14';
const BG = '#050508';

// 8 agent nodes, angles in degrees from east (right), clockwise
const NODES = [
  { label: 'RESEARCH',  angle: -90  },
  { label: 'CODE-REV',  angle: -45  },
  { label: 'SUMMARIZE', angle: 0    },
  { label: 'TRANSLATE', angle: 45   },
  { label: 'SENTIMENT', angle: 90   },
  { label: 'SQL',       angle: 135  },
  { label: 'FACT-CHK',  angle: 180  },
  { label: 'LEGAL',     angle: -135 },
];

interface Particle {
  nodeIdx: number;
  t: number;      // 0 = center, 1 = node
  speed: number;
  dir: 1 | -1;
}

function toRad(deg: number) { return deg * Math.PI / 180; }

function nodeXY(angle: number, cx: number, cy: number, R: number) {
  return { x: cx + R * Math.cos(toRad(angle)), y: cy + R * Math.sin(toRad(angle)) };
}

export default function NetworkGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Fixed internal resolution, CSS scales to container
    const IW = 640, IH = 340;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    canvas.width = IW * dpr;
    canvas.height = IH * dpr;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const cx = IW / 2;
    const cy = IH / 2;
    const R = Math.min(IW, IH) * 0.42;

    // Seed particles staggered across each connection
    const particles: Particle[] = [];
    NODES.forEach((_, i) => {
      const count = i % 3 === 2 ? 1 : 2;
      for (let p = 0; p < count; p++) {
        particles.push({
          nodeIdx: i,
          t: p === 0 ? Math.random() * 0.45 : 0.55 + Math.random() * 0.4,
          speed: 0.0030 + Math.random() * 0.0025,
          dir: Math.random() > 0.5 ? 1 : -1,
        });
      }
    });

    let raf: number;
    const t0 = Date.now();

    function draw() {
      const elapsed = (Date.now() - t0) / 1000;
      ctx.clearRect(0, 0, IW, IH);

      // Connection lines
      NODES.forEach(({ angle }) => {
        const { x, y } = nodeXY(angle, cx, cy, R);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.strokeStyle = ACCENT_DIM;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      });

      // Particles
      particles.forEach(p => {
        p.t += p.speed * p.dir;
        if (p.t >= 1) { p.t = 1; p.dir = -1; }
        if (p.t <= 0) { p.t = 0; p.dir = 1; }

        const { angle } = NODES[p.nodeIdx];
        const { x: nx, y: ny } = nodeXY(angle, cx, cy, R);
        const px = cx + (nx - cx) * p.t;
        const py = cy + (ny - cy) * p.t;

        // Halo
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 159, 39, 0.1)';
        ctx.fill();
        // Core
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT;
        ctx.fill();
      });

      // Center pulse ring
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 1.4);
      ctx.beginPath();
      ctx.arc(cx, cy, 38 + pulse * 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 159, 39, ${0.03 + pulse * 0.04})`;
      ctx.fill();

      // Center node
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.fillStyle = BG;
      ctx.fill();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center label
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillStyle = ACCENT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('JOB', cx, cy);

      // Agent nodes
      NODES.forEach(({ label, angle }, i) => {
        const { x, y } = nodeXY(angle, cx, cy, R);
        const phase = elapsed * 1.8 + i * 0.75;
        const isActive = i % 3 !== 2;
        const alphaMod = isActive ? 0.28 + 0.18 * Math.sin(phase) : 0.08;

        // Node circle
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.fillStyle = SURFACE;
        ctx.fill();
        ctx.strokeStyle = `rgba(239, 159, 39, ${alphaMod})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        const fs = label.length > 6 ? 7.5 : 8.5;
        ctx.font = `${fs}px "JetBrains Mono", monospace`;
        ctx.fillStyle = isActive
          ? `rgba(239, 159, 39, ${0.65 + 0.25 * Math.sin(phase)})`
          : 'rgba(239, 159, 39, 0.22)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);

        // Status dot
        const dotPulse = 0.5 + 0.5 * Math.sin(phase + 0.8);
        const dotR = isActive ? 2.5 + dotPulse * 0.8 : 1.8;
        ctx.beginPath();
        ctx.arc(x + 17, y - 17, dotR, 0, Math.PI * 2);
        ctx.fillStyle = isActive
          ? `rgba(239, 159, 39, ${0.7 + 0.3 * dotPulse})`
          : 'rgba(80, 80, 100, 0.5)';
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: 'auto', display: 'block', maxWidth: '640px', margin: '0 auto' }}
    />
  );
}
