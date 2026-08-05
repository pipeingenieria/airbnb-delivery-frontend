/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // Color principal (Botones de acción, íconos activos) - Un tono Coral/Rojo vibrante
        primary: {
          DEFAULT: '#FF5A5F', // Inspirado en el color cálido de Airbnb
          light: '#FF7E82',
          dark: '#E04A50',
        },
        // Colores de estado
        success: '#10B981', // Verde para "Pedido Entregado"
        warning: '#F59E0B', // Amarillo para "Preparando"
        danger: '#EF4444',  // Rojo para "Cancelado"
        // Colores de superficie
        surface: '#FFFFFF', // Fondo de tarjetas de restaurantes
        background: '#F9FAFB', // Fondo general de la app (Gris ultra claro)
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
} 
