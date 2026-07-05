'use client';

import { useRef, useEffect } from 'react';

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
  t: number;
  speed: number;
  dir: 1 | -1;
}

function toRad(deg: number) { return deg * Math.PI / 180; }

function nodeXY(angle: number, cx: number, cy: number, R: number) {
  return { x: cx + R * Math.cos(toRad(angle)), y: cy + R * Math.sin(toRad(angle)) };
}

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function NetworkGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const IW = 640, IH = 340;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    canvas.width = IW * dpr;
    canvas.height = IH * dpr;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const cx = IW / 2;
    const cy = IH / 2;
    const R = Math.min(IW, IH) * 0.42;

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

      const isDark = document.documentElement.classList.contains('dark');

      // Read theme colors each frame so they update when theme changes
      const ACCENT = getCSSVar('--accent');
      const SURFACE = getCSSVar('--surface');
      const BG = getCSSVar('--bg');
      const accentRgb = getCSSVar('--accent-rgb');

      // Light mode needs higher opacities — the same alpha values that work on
      // near-black look washed out against an off-white background.
      const lineAlpha          = isDark ? 0.20 : 0.65;
      const lineWidth          = isDark ? 0.8  : 1.2;
      const particleHaloAlpha  = isDark ? 0.12 : 0.30;
      const nodeBorderBase     = isDark ? 0.28 : 0.55;
      const nodeBorderRange    = isDark ? 0.18 : 0.12;
      const nodeBorderIdle     = isDark ? 0.08 : 0.24;
      const nodeTextBase       = isDark ? 0.65 : 0.88;
      const nodeTextRange      = isDark ? 0.25 : 0.10;
      const nodeTextIdle       = isDark ? 0.22 : 0.55;
      const dotAlphaHi         = isDark ? 0.70 : 0.95;
      const dotAlphaRange      = isDark ? 0.30 : 0.05;
      const dotAlphaIdle       = isDark ? 0.40 : 0.60;

      const accentDim          = `rgba(${accentRgb}, ${lineAlpha})`;
      const accentParticleHalo = `rgba(${accentRgb}, ${particleHaloAlpha})`;

      ctx.clearRect(0, 0, IW, IH);

      // Fill canvas bg
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, IW, IH);

      // Connection lines
      NODES.forEach(({ angle }) => {
        const { x, y } = nodeXY(angle, cx, cy, R);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.strokeStyle = accentDim;
        ctx.lineWidth = lineWidth;
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

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = accentParticleHalo;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT;
        ctx.fill();
      });

      // Center pulse ring
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 1.4);
      ctx.beginPath();
      ctx.arc(cx, cy, 38 + pulse * 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${accentRgb}, ${isDark ? 0.03 + pulse * 0.04 : 0.08 + pulse * 0.06})`;
      ctx.fill();

      // Center node — shadow in light mode so it reads as floating
      ctx.shadowBlur = isDark ? 0 : 12;
      ctx.shadowColor = isDark ? 'transparent' : 'rgba(0, 0, 0, 0.18)';
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.fillStyle = SURFACE;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = isDark ? 1.5 : 2;
      ctx.stroke();

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
        const alphaMod = isActive
          ? nodeBorderBase + nodeBorderRange * Math.sin(phase)
          : nodeBorderIdle;

        // Drop shadow in light mode so nodes read as distinct floating elements
        ctx.shadowBlur = isDark ? 0 : 8;
        ctx.shadowColor = isDark ? 'transparent' : 'rgba(0, 0, 0, 0.13)';
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.fillStyle = SURFACE;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = `rgba(${accentRgb}, ${alphaMod})`;
        ctx.lineWidth = isDark ? 1 : 1.5;
        ctx.stroke();

        const fs = label.length > 6 ? 7.5 : 8.5;
        ctx.font = `${fs}px "JetBrains Mono", monospace`;
        ctx.fillStyle = isActive
          ? `rgba(${accentRgb}, ${nodeTextBase + nodeTextRange * Math.sin(phase)})`
          : `rgba(${accentRgb}, ${nodeTextIdle})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);

        const dotPulse = 0.5 + 0.5 * Math.sin(phase + 0.8);
        const dotR = isActive ? 2.5 + dotPulse * 0.8 : 1.8;
        ctx.beginPath();
        ctx.arc(x + 17, y - 17, dotR, 0, Math.PI * 2);
        ctx.fillStyle = isActive
          ? `rgba(${accentRgb}, ${dotAlphaHi + dotAlphaRange * dotPulse})`
          : `rgba(${accentRgb}, ${dotAlphaIdle})`;
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
