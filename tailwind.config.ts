import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0b0f1a',
        surface: '#131929',
        surface2: '#1a2336',
        border: '#1e2d45',
        accent: '#00d4aa',
        danger: '#f43f5e',
        gold: '#f5a623',
        muted: '#7a8ba0',
      },
      fontFamily: {
        sans: ['var(--font-vietnam)', 'system-ui', 'sans-serif'],
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
      },
      animation: {
        ticker: 'ticker 30s linear infinite',
        'flash-green': 'flashGreen 0.5s ease-out',
        'flash-red': 'flashRed 0.5s ease-out',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        flashGreen: {
          '0%': { backgroundColor: 'rgba(0,212,170,0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
        flashRed: {
          '0%': { backgroundColor: 'rgba(244,63,94,0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
}

export default config
