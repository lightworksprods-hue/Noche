import { hexToRgb } from './helpers';

/**
 * Applies the tenant's primary color to the entire application by overriding CSS variables.
 * @param {string} primaryColor - Hex color code for the brand accent
 */
export function applyTheme(primaryColor) {
  if (!primaryColor) return;
  
  const rgb = hexToRgb(primaryColor);
  if (!rgb) return;

  const [red, green, blue] = rgb.split(',').map(Number);
  const mix = (amount, target) => [red, green, blue]
    .map(channel => Math.round(channel + (target - channel) * amount))
    .join(', ');
  const darken = amount => [red, green, blue]
    .map(channel => Math.round(channel * (1 - amount)))
    .join(', ');

  // Generate readable tints and shades from the configured tenant brand color.
  const palette = {
    50: mix(0.95, 255), 100: mix(0.9, 255), 200: mix(0.75, 255),
    300: mix(0.55, 255), 400: mix(0.25, 255), 500: `${red}, ${green}, ${blue}`,
    600: darken(0.1), 700: darken(0.2), 800: darken(0.3), 900: darken(0.4)
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
