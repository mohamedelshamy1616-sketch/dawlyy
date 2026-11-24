// Offline stand-in for next/font/google, used only by tools/run_e2e.py when fonts.gstatic.com is unreachable
// (NEXT_FONT_GOOGLE_MOCKED_RESPONSES). Without it `next dev` waits on font downloads that time out and the web server
// never becomes ready (24 Nov 2026, e2e-ar). The keys are the exact URLs next/font requests for app/[locale]/layout.tsx;
// Next returns the font "file" as the URL text, so the browser falls back to the system font as it already did.
const face = (family, weight, name) => `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(https://fonts.gstatic.com/mock/${name}.woff2) format('woff2');
}`;
module.exports = {
  'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap': face('Inter', '100 900', 'inter'),
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap': [400, 500, 600, 700]
    .map((w) => face('IBM Plex Sans Arabic', w, `plex-arabic-${w}`)).join('\n'),
};
