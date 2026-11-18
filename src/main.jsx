import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'
import { HospitalProvider } from './sim/HospitalContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HospitalProvider>
      <App />
    </HospitalProvider>
  </StrictMode>,
)
