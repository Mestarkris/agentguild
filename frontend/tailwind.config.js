/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
        'glow-cyan': 'glowCyan 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glowCyan: {
          '0%': { boxShadow: '0 0 4px rgba(6,182,212,0.4), 0 0 8px rgba(6,182,212,0.2)' },
          '100%': { boxShadow: '0 0 16px rgba(6,182,212,0.8), 0 0 32px rgba(6,182,212,0.4)' },
        },
      },
    },
  },
  plugins: [],
};
