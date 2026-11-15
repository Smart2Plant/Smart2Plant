/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F1F4EE',
        surface: '#FFFFFF',
        ink: '#17211C',
        mute: '#5C6B63',
        line: '#D5DCD3',
        tint: '#E3ECEA',
        forest: '#1F4D36',
        leaf: '#2E7D4F',
        teal: '#0E5A6B',
        soil: '#7A4B24',
        warn: '#B9770E',
        crit: '#B23A2E',
      },
      fontFamily: {
        title: ['"Bricolage Grotesque"', '"Trebuchet MS"', 'sans-serif'],
        body: ['"IBM Plex Sans"', '"Segoe UI"', 'sans-serif'],
        code: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
