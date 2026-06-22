import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

// Intercept global fetch to automatically add authentication headers and handle token expiration (401)
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const userStr = localStorage.getItem('user');
  let token = '';
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      token = user?.token || '';
    } catch (e) {
      // ignore
    }
  }

  const isApiRoute = typeof input === 'string' && input.startsWith('/api/');
  if (token && isApiRoute) {
    init = init || {};
    const headers = new Headers(init.headers);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    init.headers = headers;
  }

  const response = await originalFetch(input, init);
  const isLocalMode = import.meta.env.VITE_APP_MODE === 'LOCAL';
  if (response.status === 401 && isApiRoute && !isLocalMode) {
    localStorage.removeItem('user');
    window.location.href = '/';
  }
  return response;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
