// Ensure fetch property is writable on Window.prototype and window across all environments
(function() {
  try {
    if (typeof window !== 'undefined') {
      let activeFetch = window.fetch;
      const proto = typeof Window !== 'undefined' ? Window.prototype : Object.getPrototypeOf(window);
      if (proto) {
        try {
          Object.defineProperty(proto, 'fetch', {
            get: () => activeFetch,
            set: (v) => { activeFetch = v; },
            configurable: true,
            enumerable: true,
          });
        } catch (_) {}
      }
      try {
        Object.defineProperty(window, 'fetch', {
          get: () => activeFetch,
          set: (v) => { activeFetch = v; },
          configurable: true,
          enumerable: true,
        });
      } catch (_) {}
    }
  } catch (_) {}
})();

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

