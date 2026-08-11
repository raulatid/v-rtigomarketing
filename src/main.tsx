import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Named rather than asserted: if index.html ever loses the mount node, the
// difference between this message and "Cannot read properties of null" is the
// difference between a one-line fix and an afternoon.
const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('[main] #root not found in index.html')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
