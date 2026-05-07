import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        grafana: {
          bg: '#111217',
          panel: '#181b1f',
          border: '#2d3038',
          text: '#d0d1d3',
          muted: '#6e7077',
          cyan: '#00b5d8',
          green: '#73bf69',
          amber: '#f5a623',
          red: '#e05c53',
        },
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 8px 2px rgba(245,166,35,0.4)' },
          '50%': { boxShadow: '0 0 22px 6px rgba(245,166,35,0.75)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
