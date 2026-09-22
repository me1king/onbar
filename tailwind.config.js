const tailwindConfig = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./sections/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#D91C1C',
          cream: '#F9F4EC',
        }
      },
      borderRadius: {
        '24': '24px',
        '3xl': '24px', // Standardizing 3xl to your preferred rounding
      }
    },
  },
  plugins: [],
};

export default tailwindConfig;
