import { hexToRgb } from './helpers';

/**
 * Applies the tenant's primary color to the entire application by overriding CSS variables.
 * @param {string} primaryColor - Hex color code for the brand accent
 */
export function applyTheme(primaryColor) {
  if (!primaryColor) return;
  
  if (!hexToRgb(primaryColor)) return;

  // Keep the brand pink-led while preserving lighter and darker tones for
  // readable backgrounds, borders, text, and buttons throughout the UI.
  const palette = {
    50: '253, 242, 248', 100: '252, 231, 243', 200: '251, 207, 232',
    300: '249, 168, 212', 400: '244, 114, 182', 500: '236, 72, 153',
    600: '219, 39, 119', 700: '190, 24, 93', 800: '157, 23, 77', 900: '131, 24, 67'
  };

  // 1. Create or update a style tag for absolute priority override
  let styleTag = document.getElementById('dynamic-branding-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'dynamic-branding-style';
    document.head.appendChild(styleTag);
  }

  // Inject CSS variables into :root with !important to prevent any "glimpses" of defaults
  styleTag.innerHTML = `
    :root {
      ${Object.entries(palette).map(([shade, value]) => `--primary-${shade}: ${value} !important;`).join('\n      ')}
    }
  `;
  
  // 2. Also set properties directly on the document element for React components using inline styles
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  shades.forEach(shade => {
    document.documentElement.style.setProperty(`--primary-${shade}`, palette[shade]);
  });
}

/**
 * Removes all dynamic branding styles and returns the application to default colors.
 */
export function clearTheme() {
  // Remove the high-priority style tag
  const styleTag = document.getElementById('dynamic-branding-style');
  if (styleTag) {
    styleTag.remove();
  }
  
  // Clear the inline properties from document element
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  shades.forEach(shade => {
    document.documentElement.style.removeProperty(`--primary-${shade}`);
  });
}
