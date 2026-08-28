import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { cloneExample, EXAMPLES, type ExampleId } from './domain/examples';
import { autoLayoutCircuit } from './editor/autoLayout';
import { applyTheme, loadTheme } from './theme';
import './styles.css';
import './refinements.css';
import './theme.css';
import './embed.css';

const parameters = new URLSearchParams(window.location.search);
const embedded = parameters.get('embed') === '1';
const embedView = parameters.get('view');
const requestedExample = parameters.get('example');

if (embedded) document.documentElement.dataset.embed = 'true';
if (embedded && embedView === 'schematic') document.documentElement.dataset.embedView = 'schematic';

if (requestedExample && EXAMPLES.some((example) => example.id === requestedExample)) {
  const document = autoLayoutCircuit(cloneExample(requestedExample as ExampleId));
  localStorage.setItem('nodspice.document.v1', JSON.stringify(document));
}

applyTheme(embedded ? 'light' : loadTheme());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount point');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
