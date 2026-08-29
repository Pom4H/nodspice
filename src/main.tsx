import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { cloneExample, EXAMPLES, type ExampleId } from './domain/examples';
import { autoLayoutCircuit } from './editor/autoLayout';
import type { CircuitDocument } from './domain/types';
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

function booleanParameter(name: string, fallback: boolean): boolean {
  const value = parameters.get(name);
  if (value === null) return fallback;
  return value === '1' || value === 'true' || value === 'on';
}

function applyWalletLoads(document: CircuitDocument): CircuitDocument {
  if (requestedExample !== 'hardware-wallet-power') return document;
  const awake = booleanParameter('awake', true);
  const displayClosed = booleanParameter('display', true);
  const signingClosed = booleanParameter('signing', false);
  return {
    ...document,
    components: document.components.map((component) => {
      if (component.kind !== 'switch') return component;
      if (component.id === 's-mcu-active') {
        return { ...component, properties: { ...component.properties, closed: awake } };
      }
      if (component.id === 's-mcu-sleep') {
        return { ...component, properties: { ...component.properties, closed: !awake } };
      }
      if (component.id === 's-display') {
        return { ...component, properties: { ...component.properties, closed: displayClosed } };
      }
      if (component.id === 's-sign') {
        return { ...component, properties: { ...component.properties, closed: signingClosed } };
      }
      return component;
    }),
  };
}

if (requestedExample && EXAMPLES.some((example) => example.id === requestedExample)) {
  const circuit = applyWalletLoads(cloneExample(requestedExample as ExampleId));
  localStorage.setItem('nodspice.document.v1', JSON.stringify(autoLayoutCircuit(circuit)));
}

applyTheme(embedded ? 'light' : loadTheme());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount point');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
