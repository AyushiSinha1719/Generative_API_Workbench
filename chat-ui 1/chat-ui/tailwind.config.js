/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        'sidebar-purple': '#3B1E5F',
        'sidebar-dark': '#2A1545',
        'sidebar-hover': '#4A2D70',
      },
    },
  },
  plugins: [],
}

