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
  const [installFailed, setInstallFailed] = useState(false);

  useEffect(() => {
    // Detectar si es PWA standalone
    const mediaQueryList = window.matchMedia('(display-mode: standalone)');
    const isPWA = mediaQueryList.matches ||
                  (window.navigator as any).standalone === true ||
                  document.referrer.includes('android-app://');

    setIsStandalone(isPWA);

    // Si ya es PWA, no mostrar nada
    if (isPWA) return;

    // Verificar si el usuario ya cerró el prompt antes
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0;
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Mostrar si nunca se cerró o si pasaron más de 24 horas
    const shouldShowPrompt = !dismissed || (Date.now() - dismissedTime > oneDayMs);

    if (shouldShowPrompt) {
      // Mostrar prompt inmediatamente mientras esperamos el evento beforeinstallprompt
      setShowPrompt(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const event = e as BeforeInstallPromptEvent;
      setDeferredPrompt(event);
      setInstallFailed(false);
      // Asegurar que el prompt se muestre
      if (!isPWA && shouldShowPrompt) {
        setShowPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
      setInstallFailed(false);
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
  }, []);

  const handleInstall = async () => {
    // Si tenemos el evento nativo, usarlo
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          setShowPrompt(false);
        } else {
          // Usuario canceló la instalación
          setInstallFailed(true);
        }
      } catch (error) {
        console.error('Error al instalar:', error);
        setInstallFailed(true);
      }
    } else {
      // No hay evento nativo disponible aún
      setInstallFailed(true);
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
        disabled={!deferredPrompt}
        className={`w-full px-4 py-3 rounded-lg font-bold text-sm transition duration-200 ${
          deferredPrompt
            ? 'bg-white text-blue-600 hover:bg-blue-50'
            : 'bg-white/50 text-blue-600/70 cursor-not-allowed'
        }`}
      >
        {deferredPrompt ? 'Instalar ahora' : 'Preparando instalación...'}
      </button>

      {!deferredPrompt && (
        <div className="text-xs space-y-1 bg-white/10 rounded-lg p-3">
          <p className="font-semibold">Instalación manual:</p>
          <p>• Chrome/Edge: Menu (⋮) → "Instalar app"</p>
          <p>• Safari iOS: Compartir (↑) → "Añadir a pantalla de inicio"</p>
          <p>• Firefox: Menu (≡) → "Instalar"</p>
        </div>
      )}

      {installFailed && (
        <div className="text-xs bg-yellow-500/20 rounded-lg p-2 text-center">
          La instalación automática no está disponible. Usa las instrucciones manuales arriba.
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
