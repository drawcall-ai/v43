const DEFAULT_SPLASH = `
<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
  <svg width="40" height="40" viewBox="0 0 40 40" style="animation:v43-spin 1s linear infinite">
    <circle cx="20" cy="20" r="16" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="80" stroke-dashoffset="20" stroke-linecap="round"/>
  </svg>
</div>`

export function generateHtml(splashContent?: string): string {
  const splash = splashContent ?? DEFAULT_SPLASH

  return `<!doctype html>
<html>
<head>
  <title>V43</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    @keyframes v43-spin { to { transform: rotate(360deg) } }
    #v43-splash { position: fixed; inset: 0; z-index: 1; background: #000; }
    #v43-canvas { display: block; width: 100vw; height: 100vh; visibility: hidden; }
  </style>
</head>
<body>
  <div id="v43-splash">${splash}</div>
  <canvas id="v43-canvas"></canvas>
  <script type="module" src="/@v43/three-entry"></script>
</body>
</html>`
}
