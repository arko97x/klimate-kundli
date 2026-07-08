import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Self-hosted Umami analytics: production builds only, and the script itself
// refuses to report from any hostname but the live domain (data-domains), so
// dev servers and preview deploys never pollute the stats. To exclude your
// own browser on the live site, run once in the console:
//   localStorage.setItem('umami.disabled', '1')
if (import.meta.env.PROD) {
  const script = document.createElement('script')
  script.defer = true
  script.src = 'https://analytics.klimatekundli.com/script.js'
  script.dataset.websiteId = '4eb14e56-36ec-4364-bb8d-eda0df7860e3'
  script.dataset.domains = 'klimatekundli.com'
  document.head.appendChild(script)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
