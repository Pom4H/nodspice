import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, loadTheme } from './theme';
import './styles.css';
import './refinements.css';
import './theme.css';

applyTheme(loadTheme());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount point');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
