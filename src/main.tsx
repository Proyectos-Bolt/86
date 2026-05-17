import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import AuthWrapper from './AuthWrapper.tsx';
import ValidarComprobante from './ValidarComprobante.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/validar/:id" element={<ValidarComprobante />} />
        <Route
          path="/"
          element={
            <AuthWrapper>
              <App />
            </AuthWrapper>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
