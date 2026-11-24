/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0B0B14',
        surface: {
          DEFAULT: '#161626',
          2: '#20203A'
        },
        border: '#2E2E4D',
        text: {
          DEFAULT: '#F5F5FA',
          muted: '#A3A3C2'
        },
        primary: {
          DEFAULT: '#FFD60A',
          dark: '#E5C000',
          foreground: '#111111'
        },
        accent: {
          DEFAULT: '#FF2E88',
          hover: '#E01E74'
        },
        info: '#22D3EE',
        exit: '#FB923C',
        success: '#16A34A',
        danger: '#DC2626',
        warning: '#F59E0B',
      },
      fontFamily: {
        comic: ['Bangers', 'cursive'],
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
        heading: ['Space Grotesk', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        comic: '4px 4px 0 #000000',
        'comic-sm': '2px 2px 0 #000000',
        'comic-lg': '6px 6px 0 #000000',
        'comic-yellow': '4px 4px 0 #FFD60A',
        'comic-magenta': '4px 4px 0 #FF2E88',
        'comic-cyan': '4px 4px 0 #22D3EE',
      }
    },
  },
  plugins: [],
}

