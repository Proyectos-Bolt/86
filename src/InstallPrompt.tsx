import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isBrowser, setIsBrowser] = useState(false);

  useEffect(() => {
    // Detectar si es PWA standalone
    const mediaQueryList = window.matchMedia('(display-mode: standalone)');
    const isPWA = mediaQueryList.matches ||
                  (window.navigator as any).standalone === true ||
                  document.referrer.includes('android-app://');

    setIsStandalone(isPWA);

    // Si ya es PWA, no mostrar nada
    if (isPWA) return;

    // Detectar si está en navegador (no PWA instalada)
    // Verificar si el navegado soporta instalación de PWA
    const isRunningInBrowser = !isPWA &&
                               'serviceWorker' in navigator &&
                               window.matchMedia('(display-mode: browser)').matches;

    setIsBrowser(isRunningInBrowser);

    // Si está en navegador, mostrar prompt inmediatamente
    if (isRunningInBrowser) {
      // Verificar si el usuario ya cerró el prompt antes
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0;
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Mostrar si nunca se cerró o si pasaron más de 24 horas
      if (!dismissed || (Date.now() - dismissedTime > oneDayMs)) {
        setShowPrompt(true);
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const event = e as BeforeInstallPromptEvent;
      setDeferredPrompt(event);
      // Si recibimos el evento, aseguramos que el prompt se muestre
      if (!isStandalone) {
        setShowPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
      localStorage.removeItem('pwa-install-dismissed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    mediaQueryList.addEventListener('change', (e) => {
      setIsStandalone(e.matches);
      if (e.matches) {
        setShowPrompt(false);
      }
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQueryList.removeEventListener('change', (e) => {
        setIsStandalone(e.matches);
      });
    };
  }, [isStandalone]);

  const handleInstall = async () => {
    // Si tenemos el evento nativo, usarlo
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowPrompt(false);
      }
    } else {
      // Si no hay evento nativo, mostrar instrucciones
      // El prompt ya tiene el mensaje, solo se cierra al aceptar
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Guardar que el usuario cerró el prompt (duración 1 día)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // No mostrar si es PWA standalone
  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 right-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg shadow-lg p-4 flex flex-col gap-3 z-50 max-w-md mx-auto animate-slide-down">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Download className="w-6 h-6 flex-shrink-0" />
          <div>
            <p className="font-bold text-base">Instalar SpeedCabs</p>
            <p className="text-xs opacity-90">Usa la app como aplicación nativa</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-white hover:bg-white/20 p-2 rounded-lg transition duration-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <button
        onClick={handleInstall}
        className="w-full bg-white text-blue-600 hover:bg-blue-50 px-4 py-3 rounded-lg font-bold text-sm transition duration-200"
      >
        Instalar ahora
      </button>

      {!deferredPrompt && (
        <div className="text-xs space-y-1 bg-white/10 rounded-lg p-3">
          <p className="font-semibold">Cómo instalar manualmente:</p>
          <p>• Chrome/Edge: Menu (⋮) → "Instalar app" o "Añadir a pantalla principal"</p>
          <p>• Safari iOS: Compartir (↑) → "Añadir a pantalla de inicio"</p>
          <p>• Firefox: Menu (≡) → "Instalar" o "Añadir a pantalla principal"</p>
        </div>
      )}

      <style>{`
        @keyframes slide-down {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};
