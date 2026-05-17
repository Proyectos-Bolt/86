import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  MapPin,
  Navigation,
  DollarSign,
  Zap,
  Route,
  Clock,
  Pause,
  Info,
  ChevronDown,
  ChevronUp,
  Gauge,
  MapPinned,
  Users,
  Car,
  Plus,
  Minus,
  FastForward,
  ShoppingBag,
  Calendar,
  Shield,
  User,
  LogOut,
  FileText,
  Activity
} from 'lucide-react';
import { db } from './firebase';
import { collection, doc, setDoc, serverTimestamp, getDoc, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QRCodeCanvas } from 'qrcode.react';
import { InstallPrompt } from './InstallPrompt';

// [Otras interfaces y constantes como Position, TripData, RATES, etc. se mantienen igual]

interface Position {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface TripData {
  distance: number;
  cost: number;
  waitingTime: number;
  isRunning: boolean;
  isPaused: boolean;
  rawDistance: number; // Distancia sin descuentos para mostrar en debug
}

interface TripType {
  id: string;
  name: string;
  description: string;
  fixedPrice?: number;
  distanceKm?: number;
  subTrips?: SubTrip[];
}

interface SubTrip {
  id: string;
  name: string;
  fixedPrice: number;
}

interface TripSummary {
  tripType: string;
  distance: number;
  waitingTime: number;
  cost: number;
  timestamp: string;
  isSorianaActive: boolean;
  petConfig: PetConfig;
  servicioEspecialConfig: ServicioEspecialConfig;
  personasExtrasConfig: PersonasExtrasConfig;
  numeroParadas: number;
  costoParadas: number; // Se asegura que el costo de paradas esté aquí
}

interface PetConfig {
  active: boolean;
  withCage: boolean | null;
  cost: number;
}

interface ServicioEspecialConfig {
  active: boolean;
  type: 'recoger' | 'comprar' | null;
  cost: number;
}

interface PersonasExtrasConfig {
  active: boolean;
  ninos: number;
  adultos: number;
  cost: number;
}
// Configuración de tarifas
const RATES = {
  baseFare: 50,
  baseFareEspecial: 60,
  waitingRate: 3, // MXN por minuto
  distanceRates: [
    { min: 0, max: 3.99, price: 50 },
    { min: 4, max: 4.99, price: 55 },
    { min: 5, max: 5.99, price: 60 },
    { min: 6, max: 6.99, price: 65 },
    { min: 7, max: 7.99, price: 70 },
    { min: 8, max: Infinity, basePrice: 80, extraRate: 16 }
  ],
  paradaRapida: 20, // Nuevo costo para parada rápida
  paradaServicio: 50 // Costo para servicio de parada
};

// Tipos de viaje
const TRIP_TYPES: TripType[] = [
  {
    id: 'normal',
    name: 'Viaje Normal',
    description: 'Tarifa por distancia recorrida'
  },
  {
    id: 'walmart',
    name: 'Ruta Walmart',
    description: 'Centro → Walmart Guzmán',
    distanceKm: 5.2,
    fixedPrice: 60
  },
  {
    id: 'tecnologico',
    name: 'Ruta Tecnológico',
    description: 'Centro → Tec. Guzmán',
    distanceKm: 5.9,
    fixedPrice: 70
  },
  {
    id: 'cristoRey',
    name: 'Ruta Cristo Rey',
    description: 'Centro → Cerro Cristo Rey',
    subTrips: [
      {
        id: 'cristoRey-cano',
        name: 'Caño',
        fixedPrice: 60
      },
      {
        id: 'cristoRey-mitad',
        name: 'Mitad',
        fixedPrice: 70
      },
      {
        id: 'cristoRey-arriba',
        name: 'Arriba',
        fixedPrice: 80
      }
    ]
  },
  {
    id: 'colmena',
    name: 'La Colmena',
    description: 'Precio base $120',
    fixedPrice: 120
  }
];

// Zonas especiales ($70 MXN) en orden alfabético
const SPECIAL_ZONES = [
  'Américas',
  'Col. San José',
  'Emiliano Zapata',
  'Las Garzas',
  'Las Lomas',
  'Pueblos de Jalisco',
  'Valle de Zapotlan'
].sort();


// Función para calcular distancia entre dos puntos GPS (fórmula Haversine)
const calculateDistance = (pos1: Position, pos2: Position): number => {
  // Fórmula de Vincenty - Mucho más precisa para distancias cortas
  // Parámetros del elipsoide WGS84
  const a = 6378137; // Semi-eje mayor en metros
  const b = 6356752.314245; // Semi-eje menor en metros
  const f = 1 / 298.257223563; // Aplanamiento
  
  const lat1 = pos1.latitude * Math.PI / 180;
  const lat2 = pos2.latitude * Math.PI / 180;
  const deltaLon = (pos2.longitude - pos1.longitude) * Math.PI / 180;
  
  const L = deltaLon;
  const U1 = Math.atan((1 - f) * Math.tan(lat1));
  const U2 = Math.atan((1 - f) * Math.tan(lat2));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);
  
  let lambda = L;
  let lambdaP;
  let iterLimit = 100;
  let cosSqAlpha, sinSigma, cos2SigmaM, cosSigma, sigma;
  
  do {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinLambda) * (cosU2 * sinLambda) +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda));
    
    if (sinSigma === 0) return 0; // Puntos coincidentes
    
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha;
    
    if (isNaN(cos2SigmaM)) cos2SigmaM = 0; // Línea ecuatorial
    
    const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda = L + (1 - C) * f * sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0);
  
  if (iterLimit === 0) {
    // Fallback a fórmula más simple si no converge
    const R = 6371000;
    const dLat = (pos2.latitude - pos1.latitude) * Math.PI / 180;
    const dLon = (pos2.longitude - pos1.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pos1.latitude * Math.PI / 180) * Math.cos(pos2.latitude * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
  const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
    B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  
  const distance = b * A * (sigma - deltaSigma);
  
  // Factor de corrección reducido ya que Vincenty es más preciso
  // Solo un pequeño ajuste para compensar el filtrado del GPS móvil
  const correctionFactor = 1.15; // Reducido del 40% al 15%
  
  return distance * correctionFactor;
};

// Componente principal de la aplicación
function App({ isAdmin = false }: { isAdmin?: boolean }) {
  const [tripData, setTripData] = useState<TripData>({
    distance: 0,
    cost: RATES.baseFare,
    waitingTime: 0,
    isRunning: false,
    isPaused: false,
    rawDistance: 0
  });

  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'requesting' | 'available' | 'denied' | 'unavailable'>('requesting');
  const [selectedTripType, setSelectedTripType] = useState<TripType>(TRIP_TYPES[0]);
  const [selectedSubTrip, setSelectedSubTrip] = useState<SubTrip | null>(null);
  const [showTripTypeSelector, setShowTripTypeSelector] = useState(false);
  const [showSubTripSelector, setShowSubTripSelector] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [lastTripSummary, setLastTripSummary] = useState<TripSummary | null>(null);
  const [showRates, setShowRates] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>(''); // No usada actualmente, pero se mantiene
  const [googleMapsReady, setGoogleMapsReady] = useState(false); // No usada actualmente, pero se mantiene
  const [totalWaitingTime, setTotalWaitingTime] = useState(0);
  const [showExtrasSelector, setShowExtrasSelector] = useState(false);
  const [serviciosExtrasActive, setServiciosExtrasActive] = useState(false); // No usada actualmente, pero se mantiene
  const [showPetSelector, setShowPetSelector] = useState(false);
  const [petConfig, setPetConfig] = useState<PetConfig>({
    active: false,
    withCage: null,
    cost: 0
  });
  const [showServicioEspecialSelector, setShowServicioEspecialSelector] = useState(false);
  const [servicioEspecialConfig, setServicioEspecialConfig] = useState<ServicioEspecialConfig>({
    active: false,
    type: 'recoger' as const,
    cost: 0
  });
  const [showFinalizarParada, setShowFinalizarParada] = useState(false); // No usada actualmente, pero se mantiene
  const [costoAcumuladoParadas, setCostoAcumuladoParadas] = useState(0);
  const [numeroParadas, setNumeroParadas] = useState(0);
  const [showPersonasExtrasSelector, setShowPersonasExtrasSelector] = useState(false);
  const [personasExtrasConfig, setPersonasExtrasConfig] = useState<PersonasExtrasConfig>({
    active: false,
    ninos: 0,
    adultos: 0,
    cost: 0
  });
  // Nuevo estado para el selector de tipo de parada
  const [showParadaSelector, setShowParadaSelector] = useState(false); 


  // Estado para el check de Soriana
  const [isSorianaActive, setIsSorianaActive] = useState(false);
  const [selectedSorianaZone, setSelectedSorianaZone] = useState<string | null>(null);

  // Estado para la simulación
  const [isSimulating, setIsSimulating] = useState(false);
  const simulationInterval = useRef<NodeJS.Timeout | null>(null);

  // Estado para modal de Foraneos
  const [showForaneosModal, setShowForaneosModal] = useState(false);

  // Estado para modal admin (solo visible para admin)
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Estado para ganancias del día
  const [dailyEarnings, setDailyEarnings] = useState(0);
  const [showEarningsModal, setShowEarningsModal] = useState(false);

  // Estado para ganancias mensuales
  const [showMonthlyEarningsModal, setShowMonthlyEarningsModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [monthlyEarningsData, setMonthlyEarningsData] = useState<Array<{dia: number, ganancia: number}>>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  // Estados para panel de usuario
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [userData, setUserData] = useState<{
    email: string;
    nombre: string;
    telefono: string;
    idZello: string;
    vehiculo?: string;
    placas?: string;
    createdAt?: any;
  } | null>(null);

  // Estados para comprobante de ingresos
  const [showIncomeCertificateModal, setShowIncomeCertificateModal] = useState(false);
  const [showIncomeCertificateConfirm, setShowIncomeCertificateConfirm] = useState(false);
  const [isGeneratingCertificate, setIsGeneratingCertificate] = useState(false);

  // Estado para tipo de tarifa (normal, especial o soriana)
  const [tarifaTipo, setTarifaTipo] = useState<'normal' | 'especial' | 'soriana'>('normal');

  // Estado para modal de Rutas
  const [showRutasModal, setShowRutasModal] = useState(false);
  const [selectedRutaCategory, setSelectedRutaCategory] = useState<string | null>(null);
  const [selectedDestino, setSelectedDestino] = useState<string | null>(null);
  const [routeBaseFare, setRouteBaseFare] = useState<number | null>(null);
  const [routeType, setRouteType] = useState<'tecnologico' | 'walmart' | null>(null);

  // Estados para contar usuarios registrados
  const [totalUsuarios, setTotalUsuarios] = useState<number>(0);
  const [usuariosLoaded, setUsuariosLoaded] = useState<boolean>(false);

  // Referencias para mantener estado en callbacks
  const isActiveRef = useRef(false);
  const lastPositionRef = useRef<Position | null>(null);
  const waitingStartTime = useRef<number | null>(null);
  const waitingInterval = useRef<NodeJS.Timeout | null>(null);

  // Función para calcular la tarifa
  const getBasePrice = (tripType: TripType): number => {
    if (selectedSubTrip && tripType.id === 'cristoRey') {
      return selectedSubTrip.fixedPrice;
    }
    const baseFareFromType = (tarifaTipo === 'especial' || tarifaTipo === 'soriana') ? RATES.baseFareEspecial : RATES.baseFare;
    return tripType.fixedPrice || baseFareFromType;
  };

  // Función para manejar la adición de una parada (rápida o de servicio)
  const handleParadaAdd = (cost: number, resetDistance: boolean = false) => {
    setNumeroParadas(prev => prev + 1);
    setCostoAcumuladoParadas(prev => prev + cost);

    // Si es parada con servicio, reiniciar la distancia
    if (resetDistance) {
      setTripData(prev => ({
        ...prev,
        distance: 0,
        rawDistance: 0
      }));
      lastPositionRef.current = null;
    }

    setShowParadaSelector(false);
  };

  // Función para calcular la tarifa
  const calculateFare = useCallback((distanceKm: number, waitingMinutes: number, sorianaBonus: boolean = false, accumulatedStopsCost: number = costoAcumuladoParadas) => {
    // Calcular costo adicional de mascotas
    const petExtraFee = petConfig.active ? petConfig.cost : 0;

    // Calcular costo adicional de personas extras
    const personasExtrasFee = personasExtrasConfig.active ? personasExtrasConfig.cost : 0;

    // Si zona especial está activa Y se seleccionó una zona, el costo es fijo de $70 MXN
    if (sorianaBonus && selectedSorianaZone) {
      return accumulatedStopsCost + 70 + (waitingMinutes * RATES.waitingRate) + petExtraFee + personasExtrasFee;
    }

    // Lógica especial para Colmena
    if (selectedTripType.id === 'colmena') {
      let fare = 120;
      if (distanceKm > 4.9) {
        const kmExtra = distanceKm - 4.9;
        fare = 120 + (Math.ceil(kmExtra) * 10);
      }
      return accumulatedStopsCost + fare + (waitingMinutes * RATES.waitingRate) + petExtraFee + personasExtrasFee;
    }

    // Calcular extra de $5 MXN para viajes diferentes al normal después de 3.7 km
    // O si zona especial está activa sin zona seleccionada
    const tripTypeExtraFee = ((selectedTripType.id !== 'normal' || (sorianaBonus && !selectedSorianaZone)) && distanceKm >= 3.7) ? 5 : 0;

    // Determinar el precio base según el tipo de viaje O servicio especial
    let baseFareToUse;
    if (routeBaseFare !== null) {
      // Si se seleccionó una altura en Pueblito/Pared, usar ese costo como base
      baseFareToUse = routeBaseFare;
    } else if (servicioEspecialConfig.active) {
      // Si hay servicio especial, el precio base ES el costo del servicio (60 o 70)
      baseFareToUse = servicioEspecialConfig.cost;
    } else if (selectedTripType.id === 'cristoRey' && selectedSubTrip) {
      baseFareToUse = selectedSubTrip.fixedPrice;
    } else {
      // Usar el precio base según si es tarifa normal, especial o soriana
      const baseFareFromType = (tarifaTipo === 'especial' || tarifaTipo === 'soriana') ? RATES.baseFareEspecial : RATES.baseFare;
      baseFareToUse = selectedTripType.fixedPrice || baseFareFromType;
    }

    // Cálculo por distancia
    let fare = baseFareToUse;

    // Si routeBaseFare está activo
    if (routeBaseFare !== null) {
      // Walmart: incremente $5 por km después de 4km
      if (routeType === 'walmart' && distanceKm > 4) {
        const extraKmAfter4 = distanceKm - 4;
        fare += extraKmAfter4 * 5;
      }
      // Tecnológico: precio fijo sin aumentos (routeType === 'tecnologico')
    } else {
      if (selectedTripType.id !== 'normal') {
        // Para viajes diferentes a "Viaje Normal": precio base + 10 MXN por km después de 5 km
        if (distanceKm > 5) {
          const extraKmAfter5 = distanceKm - 5;
          fare += extraKmAfter5 * 10;
        }
      } else {
        // Para "Viaje Normal": usar la tabla de tarifas por distancia
        for (const rate of RATES.distanceRates) {
          if (distanceKm >= rate.min && distanceKm <= rate.max) {
            if (rate.extraRate && distanceKm > 8) {
              const extraKm = distanceKm - 8;
              const adjustedBasePrice = (rate.basePrice! - RATES.baseFare) + baseFareToUse;
              fare = adjustedBasePrice + (extraKm * rate.extraRate);
            } else {
              const priceIncrease = rate.price! - RATES.baseFare;
              fare = baseFareToUse + priceIncrease;
            }
            break;
          }
        }
      }
    }

    return accumulatedStopsCost + fare + (waitingMinutes * RATES.waitingRate) + petExtraFee + personasExtrasFee + tripTypeExtraFee;
  }, [selectedTripType, selectedSubTrip, petConfig, servicioEspecialConfig, personasExtrasConfig, costoAcumuladoParadas, selectedSorianaZone, tarifaTipo, routeBaseFare, routeType]);
  // NOTA: Se ha agregado 'costoAcumuladoParadas' y 'tarifaTipo' a las dependencias.

  // Formatear tiempo
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Manejar nueva posición GPS
  const handlePositionUpdate = useCallback((position: Position) => {
    setCurrentPosition(position);
    setGpsStatus('available');

    // Verificamos la referencia 'en vivo' del estado activo
    if (isActiveRef.current && !tripData.isPaused) {
      if (lastPositionRef.current) {
        // La distancia se calcula en metros para mayor precisión.
        const newDistanceMeters = calculateDistance(lastPositionRef.current, position);
        
        // Umbral más alto para filtrar mejor el "ruido" GPS y evitar cálculos prematuros
        const THRESHOLD = 15; // Aumentado de 5 a 15 metros
        if (newDistanceMeters > THRESHOLD) {
          // Convertimos a km para sumar al total
          const newDistanceKm = newDistanceMeters / 1000;
          setTripData(prev => {
            const rawTotalDistance = prev.rawDistance + newDistanceKm;
            
            // Aplicar descuento de 0.125 km por cada kilómetro completado
            const completedKm = Math.floor(rawTotalDistance);
            const discount = completedKm * 0.125;
            const adjustedDistance = Math.max(0, rawTotalDistance - discount);
            
            const waitingMinutes = Math.floor(prev.waitingTime / 60);
            return {
              ...prev,
              rawDistance: rawTotalDistance,
              distance: adjustedDistance,
              cost: calculateFare(adjustedDistance, waitingMinutes, isSorianaActive)
            };
          });
          // SOLO actualizar la última posición cuando realmente se registra movimiento
          lastPositionRef.current = position;
        }
      } else {
        // Primera posición después de iniciar - establecer como punto de referencia
        lastPositionRef.current = position;
      }
    }
  }, [calculateFare, tripData.isPaused, isSorianaActive]);

  // Inicializar GPS
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const position: Position = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            timestamp: Date.now()
          };
          setCurrentPosition(position);
          lastPositionRef.current = position;
          setGpsStatus('available');
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setGpsStatus('denied');
          } else {
            setGpsStatus('unavailable');
          }
        },
        { enableHighAccuracy: true }
      );
    } else {
      setGpsStatus('unavailable');
    }
  }, []);

  // Iniciar contador de tiempo de espera
  const startWaitingTimer = () => {
    waitingStartTime.current = Date.now();
    waitingInterval.current = setInterval(() => {
      if (waitingStartTime.current) {
        const elapsed = Math.floor((Date.now() - waitingStartTime.current) / 1000);
        const currentWaitingTime = totalWaitingTime + elapsed;
        setTripData(prev => ({
          ...prev,
          waitingTime: currentWaitingTime
        }));
      }
    }, 1000);
  };

  // Detener contador de tiempo de espera
  const stopWaitingTimer = () => {
    if (waitingInterval.current) {
      clearInterval(waitingInterval.current);
      waitingInterval.current = null;
    }
    
    // Acumular el tiempo de espera cuando se detiene el timer
    if (waitingStartTime.current) {
      const elapsed = Math.floor((Date.now() - waitingStartTime.current) / 1000);
      setTotalWaitingTime(prev => prev + elapsed);
    }
    
    waitingStartTime.current = null;
  };

  // Iniciar taxímetro
  const startTrip = () => {
    if (currentPosition) {
      isActiveRef.current = true;
      // NO establecer lastPositionRef aquí - se establecerá en la primera actualización
      lastPositionRef.current = null;
      
      // Resetear tiempo de espera acumulado
      setTotalWaitingTime(0);
      
      setTripData(prev => ({
        ...prev,
        distance: 0, // Asegurar que siempre inicie en 0
        rawDistance: 0, // También resetear distancia cruda
        waitingTime: 0,
        isRunning: true,
        isPaused: false
      }));

      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const position: Position = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            timestamp: Date.now()
          };
          handlePositionUpdate(position);
        },
        (error) => console.error('GPS Error:', error),
        {
          enableHighAccuracy: true,
          maximumAge: 500,
          timeout: 10000
        }
      );
      setWatchId(id);
    }
  };

  // Pausar/Reanudar taxímetro
  const togglePause = () => {
    setTripData(prev => {
      const newPaused = !prev.isPaused;
      
      if (newPaused) {
        // Pausar - iniciar contador de espera
        startWaitingTimer();
      } else {
        // Reanudar - detener contador de espera
        stopWaitingTimer();
      }
      
      return {
        ...prev,
        isPaused: newPaused
      };
    });
  };

  // Detener taxímetro
  const stopTrip = () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }

    stopWaitingTimer();
    
    // Crear resumen del viaje (capturar estado de extras antes de resetear)
    const summary: TripSummary = {
      tripType: selectedTripType.name,
      distance: tripData.distance,
      waitingTime: tripData.waitingTime,
      cost: tripData.cost, // <--- ESTE VALOR YA INCLUYE EL costoAcumuladoParadas GRACIAS AL ULTIMO useEffect
      timestamp: new Date().toLocaleString(),
      isSorianaActive: isSorianaActive,
      petConfig: { ...petConfig },
      servicioEspecialConfig: { ...servicioEspecialConfig },
      personasExtrasConfig: { ...personasExtrasConfig },
      numeroParadas: numeroParadas,
      costoParadas: costoAcumuladoParadas // <--- GUARDAMOS EL COSTO DE PARADAS PARA EL DESGLOSE
    };
    
    setLastTripSummary(summary);
    setShowSummary(true);
    
    // Resetear datos del viaje
    isActiveRef.current = false;
    setTotalWaitingTime(0);
    
    // **CORRECCIÓN 1 Y 2: Reiniciar el tipo de viaje a "Viaje Altar Mayor" y el costo a la tarifa base.**
    const initialTripType = TRIP_TYPES[0];
    setSelectedTripType(initialTripType);
    setSelectedSubTrip(null);

    setTripData({
      distance: 0,
      rawDistance: 0,
      cost: (tarifaTipo === 'especial' || tarifaTipo === 'soriana') ? RATES.baseFareEspecial : RATES.baseFare,
      waitingTime: 0,
      isRunning: false,
      isPaused: false
    });

    // Resetear extras
    setServiciosExtrasActive(false);
    setPetConfig({
      active: false,
      withCage: null,
      cost: 0
    });
    setServicioEspecialConfig({
      active: false,
      type: null,
      cost: 0
    });
    setPersonasExtrasConfig({
      active: false,
      ninos: 0,
      adultos: 0,
      cost: 0
    });
    setIsSorianaActive(false);
    setSelectedSorianaZone(null);
    setCostoAcumuladoParadas(0);
    setNumeroParadas(0);
    setTarifaTipo('normal');
    setRouteBaseFare(null);
    setRouteType(null);

    lastPositionRef.current = currentPosition;
  };

  // Función para iniciar/detener simulación
  const toggleSimulation = () => {
    if (isSimulating) {
      if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
        simulationInterval.current = null;
      }
      setIsSimulating(false);
    } else {
      setIsSimulating(true);
      simulationInterval.current = setInterval(() => {
        setTripData(prev => {
          const newDistance = prev.distance + 0.1;
          const waitingMinutes = Math.floor(prev.waitingTime / 60);
          return {
            ...prev,
            distance: newDistance,
            rawDistance: newDistance,
            cost: calculateFare(newDistance, waitingMinutes, isSorianaActive)
          };
        });
      }, 1000);
    }
  };

  // Limpiar simulación al desmontar
  useEffect(() => {
    return () => {
      if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
      }
    };
  }, []);

  // Efecto para actualizar el costo cuando cambia el tipo de viaje (solo si no está corriendo)
  useEffect(() => {
    if (!tripData.isRunning) {
      // Recalcular el costo inicial usando la base + cualquier extra activo (como paradas anteriores)
      const waitingMinutes = Math.floor(tripData.waitingTime / 60);
      setTripData(prev => ({
        ...prev,
        cost: calculateFare(prev.distance, waitingMinutes, isSorianaActive)
      }));
    }
  }, [selectedTripType, selectedSubTrip, tripData.isRunning, calculateFare, isSorianaActive, tripData.distance, tripData.waitingTime]);

  // Efecto para actualizar el costo cuando cambia el tiempo de espera
  useEffect(() => {
    if (tripData.isRunning) {
      const waitingMinutes = Math.floor(tripData.waitingTime / 60);
      setTripData(prev => ({
        ...prev,
        cost: calculateFare(prev.distance, waitingMinutes, isSorianaActive)
      }));
    }
  }, [calculateFare, tripData.waitingTime, tripData.isRunning, isSorianaActive]);
  
  // Efecto CLAVE para actualizar el costo total cuando cambia CUALQUIER EXTRA (Incluyendo Paradas)
  // Este useEffect garantiza que tripData.cost siempre esté actualizado con costoAcumuladoParadas
  useEffect(() => {
    if (personasExtrasConfig.active || tripData.isRunning || petConfig.active || servicioEspecialConfig.active || isSorianaActive || costoAcumuladoParadas > 0) {
      const waitingMinutes = Math.floor(tripData.waitingTime / 60);
      setTripData(prev => ({
        ...prev,
        cost: calculateFare(prev.distance, waitingMinutes, isSorianaActive)
      }));
    }
  }, [calculateFare, personasExtrasConfig, petConfig, servicioEspecialConfig, isSorianaActive, costoAcumuladoParadas, tripData.isRunning, tripData.distance, tripData.waitingTime]);

  // Efecto para actualizar el costo cuando cambia el tipo de tarifa
  useEffect(() => {
    const waitingMinutes = Math.floor(tripData.waitingTime / 60);
    setTripData(prev => ({
      ...prev,
      cost: calculateFare(prev.distance, waitingMinutes, isSorianaActive)
    }));
  }, [tarifaTipo, calculateFare, isSorianaActive, tripData.distance, tripData.waitingTime]);

  // Cargar ganancias del día desde Firestore al iniciar sesión
  useEffect(() => {
    const loadDailyEarnings = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const earningsRef = doc(db, 'gananciasDiarias', user.uid);
          const docSnapshot = await getDoc(earningsRef);

          if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            setDailyEarnings(data.Total || 0);
          }
        }
      } catch (error) {
        console.error('Error al cargar ganancias del día:', error);
      }
    };

    loadDailyEarnings();
  }, []);

  // Cargar datos del usuario desde Firestore
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const userDocRef = doc(db, 'usuarios', user.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserData({
              email: data.email || '',
              nombre: data.nombre || '',
              telefono: data.telefono || '',
              idZello: data.idZello || '',
              vehiculo: data.vehiculo || '',
              placas: data.placas || '',
              createdAt: data.createdAt || null
            });
          }
        }
      } catch (error) {
        console.error('Error al cargar datos del usuario:', error);
      }
    };

    loadUserData();
  }, []);

  // Función para cargar solo meses con datos disponibles
  const loadAvailableMonths = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const months = [];
      const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      const now = new Date();
      const monthsWithData: string[] = [];

      for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = `${meses[date.getMonth()]}_${date.getFullYear()}`;
        months.push(monthName);
      }

      for (const monthName of months) {
        try {
          const userDocRef = doc(db, 'bitacora_ganancias', user.uid);
          const mesSubcollectionRef = collection(userDocRef, monthName);
          const q = query(mesSubcollectionRef);
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            monthsWithData.push(monthName);
          }
        } catch (error) {
          console.error(`Error checking month ${monthName}:`, error);
        }
      }

      setAvailableMonths(monthsWithData);
    } catch (error) {
      console.error('Error loading available months:', error);
    }
  };

  // Función para contar usuarios registrados
  const countUsuarios = async () => {
    try {
      const usuariosRef = collection(db, 'usuarios');
      const q = query(usuariosRef);
      const querySnapshot = await getDocs(q);
      setTotalUsuarios(querySnapshot.size);
      setUsuariosLoaded(true);
    } catch (error) {
      console.error('Error al contar usuarios:', error);
      setUsuariosLoaded(false);
    }
  };

  // Cargar datos de un mes específico
  const loadMonthlyData = async (monthName: string) => {
    try {
      const user = auth.currentUser;
      if (user && monthName) {
        const userDocRef = doc(db, 'bitacora_ganancias', user.uid);
        const mesSubcollectionRef = collection(userDocRef, monthName);
        const q = query(mesSubcollectionRef, orderBy('dia', 'asc'));
        const querySnapshot = await getDocs(q);

        const data: Array<{dia: number, ganancia: number}> = [];
        querySnapshot.forEach((doc) => {
          const docData = doc.data();
          data.push({
            dia: docData.dia,
            ganancia: docData.ganancia || 0
          });
        });

        setMonthlyEarningsData(data);
      }
    } catch (error) {
      console.error('Error al cargar datos mensuales:', error);
      setMonthlyEarningsData([]);
    }
  };

  const generateQRCodeImage = (text: string, size: number = 200): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const qrElement = document.createElement('div');
      qrElement.style.position = 'absolute';
      qrElement.style.left = '-9999px';
      document.body.appendChild(qrElement);

      const root = document.createElement('div');
      qrElement.appendChild(root);

      import('react-dom/client').then(({ createRoot }) => {
        const reactRoot = createRoot(root);
        reactRoot.render(
          React.createElement(QRCodeCanvas, {
            value: text,
            size: size,
            level: 'H',
            includeMargin: true
          })
        );

        setTimeout(() => {
          const qrCanvas = root.querySelector('canvas') as HTMLCanvasElement;
          if (qrCanvas) {
            const imageData = qrCanvas.toDataURL('image/png');
            document.body.removeChild(qrElement);
            resolve(imageData);
          } else {
            document.body.removeChild(qrElement);
            resolve('');
          }
        }, 100);
      });
    });
  };

  const generateIncomeCertificate = async () => {
    try {
      setIsGeneratingCertificate(true);
      const user = auth.currentUser;

      if (!user) {
        alert('Usuario no autenticado');
        setIsGeneratingCertificate(false);
        return;
      }

      const now = new Date();
      const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      const months: string[] = [];
      const monthsForDisplay: string[] = [];

      // Excluir mes actual - Tomar los 3 meses completos anteriores
      for (let i = 1; i <= 3; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${meses[date.getMonth()]}_${date.getFullYear()}`;
        const monthDisplay = `${meses[date.getMonth()].charAt(0).toUpperCase() + meses[date.getMonth()].slice(1)} ${date.getFullYear()}`;
        months.push(monthKey);
        monthsForDisplay.push(monthDisplay);
      }

      const monthsData: Array<{month: string, days: Array<{dia: number, ganancia: number}>, total: number, hasData: boolean}> = [];

      for (let i = 0; i < months.length; i++) {
        const monthKey = months[i];
        try {
          const userDocRef = doc(db, 'bitacora_ganancias', user.uid);
          const mesSubcollectionRef = collection(userDocRef, monthKey);
          const q = query(mesSubcollectionRef, orderBy('dia', 'asc'));
          const querySnapshot = await getDocs(q);

          const data: Array<{dia: number, ganancia: number}> = [];
          let total = 0;

          querySnapshot.forEach((docSnapshot) => {
            const docData = docSnapshot.data();
            data.push({
              dia: docData.dia,
              ganancia: docData.ganancia || 0
            });
            total += docData.ganancia || 0;
          });

          const [mesNombre, año] = monthKey.split('_');
          const monthName = `${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)} de ${año}`;
          monthsData.push({
            month: monthName,
            days: data,
            total: total,
            hasData: !querySnapshot.empty
          });
        } catch (error) {
          console.error(`Error al cargar datos de ${monthKey}:`, error);
          const [mesNombre, año] = monthKey.split('_');
          const monthName = `${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)} de ${año}`;
          monthsData.push({
            month: monthName,
            days: [],
            total: 0,
            hasData: false
          });
        }
      }

      // Validación: Verificar que existan datos en los 3 meses completos
      const monthsWithData = monthsData.filter(m => m.hasData);
      const monthsDetected = monthsWithData.map(m => m.month).join(', ');

      if (monthsWithData.length < 3) {
        setIsGeneratingCertificate(false);
        setShowIncomeCertificateConfirm(false);
        setShowIncomeCertificateModal(false);
        alert(`No es posible generar la constancia: se requieren al menos 3 meses completos de historial.\n\nMeses detectados: ${monthsDetected || 'Ninguno'}`);
        return;
      }

      const pdfDoc = new jsPDF();
      const pageHeight = pdfDoc.internal.pageSize.getHeight();
      const pageWidth = pdfDoc.internal.pageSize.getWidth();
      let yPosition = 20;

      const today = new Date();
      const ciudadZapotlan = 'Ciudad Guzmán, Jalisco';
      const fechaFormato = today.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.setFontSize(11);
      pdfDoc.text(`${ciudadZapotlan} a ${fechaFormato}`, 20, yPosition);
      yPosition += 15;

      pdfDoc.setFontSize(11);
      pdfDoc.setFont(undefined, 'bold');
      pdfDoc.text('PRESENTE', 20, yPosition);
      yPosition += 15;

      pdfDoc.setFont(undefined, 'normal');
      pdfDoc.setFontSize(10);

      const parrafo1 = `SpeedCabsZapotlan S.A.S de C.V., a través de su Director General, Ernesto Ruiz Angeles, hace constar lo siguiente:`;
      const splitParrafo1 = pdfDoc.splitTextToSize(parrafo1, pageWidth - 40);
      pdfDoc.text(splitParrafo1, 20, yPosition);
      yPosition += (splitParrafo1.length * 5) + 10;

      const conductorNombre = userData?.nombre || 'N/A';
      const vehiculo = userData?.vehiculo || 'N/A';
      const placas = userData?.placas || 'N/A';
      let fechaRegistro = 'N/A';
      if (userData?.createdAt) {
        try {
          const fecha = userData.createdAt.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
          fechaRegistro = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch {
          fechaRegistro = 'N/A';
        }
      }
      const parrafo2 = `${conductorNombre}, con vehículo ${vehiculo}, placas ${placas}, trabaja actualmente en esta compañía utilizando uno de nuestros sistemas. ${conductorNombre} ha prestado sus servicios a esta empresa desde ${fechaRegistro}.`;
      const splitParrafo2 = pdfDoc.splitTextToSize(parrafo2, pageWidth - 40);
      pdfDoc.text(splitParrafo2, 20, yPosition);
      yPosition += (splitParrafo2.length * 5) + 10;

      const totalIncome = monthsData.reduce((sum, m) => sum + m.total, 0);
      const promedioMensual = totalIncome / 3;

      pdfDoc.setFont(undefined, 'bold');
      pdfDoc.setFontSize(11);
      pdfDoc.text('RESUMEN DE INGRESOS NETOS', 20, yPosition);
      yPosition += 10;

      pdfDoc.setFont(undefined, 'normal');
      pdfDoc.setFontSize(10);
      monthsData.forEach((monthData) => {
        const monthName = monthData.month.charAt(0).toUpperCase() + monthData.month.slice(1);
        pdfDoc.text(`- ${monthName}: $${monthData.total.toFixed(2)} MXN`, 30, yPosition);
        yPosition += 7;
      });

      yPosition += 5;
      pdfDoc.setFont(undefined, 'bold');
      const ingresoPromedioTexto = `Ingreso Promedio Mensual: $${promedioMensual.toFixed(2)} MXN`;
      pdfDoc.text(ingresoPromedioTexto, 20, yPosition);
      yPosition += 7;
      const totalText = `Total 3 Meses: $${totalIncome.toFixed(2)} MXN`;
      pdfDoc.text(totalText, 20, yPosition);
      yPosition += 15;

      pdfDoc.setFont(undefined, 'normal');
      const parrafo3 = 'Se extiende la presente constancia para los fines que al interesado convengan.';
      pdfDoc.text(parrafo3, 20, yPosition);
      yPosition += 20;

      pdfDoc.text('Atentamente,', 20, yPosition);
      yPosition += 30;

      pdfDoc.setLineWidth(0.5);
      pdfDoc.line(20, yPosition, 100, yPosition);
      yPosition += 7;

      pdfDoc.setFont(undefined, 'bold');
      pdfDoc.text('Ernesto Ruiz Angeles', 20, yPosition);
      yPosition += 5;
      pdfDoc.setFont(undefined, 'normal');
      pdfDoc.text('Director General', 20, yPosition);
      yPosition += 5;
      pdfDoc.text('SpeedCabsZapotlan S.A.S de C.V.', 20, yPosition);

      const qrUrl = `${window.location.origin}/validar/${user.uid}`;
      const qrImage = await generateQRCodeImage(qrUrl, 200);

      if (qrImage) {
        const qrSize = 40;
        const qrX = pageWidth - qrSize - 20;
        const qrY = yPosition - 50;

        pdfDoc.addImage(qrImage, 'PNG', qrX, qrY, qrSize, qrSize);

        pdfDoc.setFontSize(8);
        pdfDoc.setTextColor(100, 100, 100);
        pdfDoc.text('Escanea para validar', qrX + (qrSize / 2), qrY + qrSize + 5, { align: 'center' });
        pdfDoc.setTextColor(0, 0, 0);
      }

      const addFooter = () => {
        const footerY = pageHeight - 15;
        pdfDoc.setFontSize(8);
        pdfDoc.setTextColor(100, 100, 100);
        pdfDoc.setFont(undefined, 'normal');
        pdfDoc.text('SpeedCabsZapotlan S.A.S de C.V. - Sistema de Gestión de Viajes', pageWidth / 2, footerY, { align: 'center' });
        pdfDoc.setTextColor(0, 0, 0);
      };

      pdfDoc.addPage();
      yPosition = 20;
      pdfDoc.setFont(undefined, 'bold');
      pdfDoc.setFontSize(12);
      pdfDoc.text('DETALLE DE GANANCIAS POR MES Y DÍA', 20, yPosition);
      yPosition += 15;

      pdfDoc.setFont(undefined, 'normal');
      pdfDoc.setFontSize(9);

      monthsData.forEach((monthData, index) => {
        if (yPosition > pageHeight - 40) {
          addFooter();
          pdfDoc.addPage();
          yPosition = 20;
        }

        pdfDoc.setFont(undefined, 'bold');
        pdfDoc.setFontSize(10);
        const monthName = monthData.month.charAt(0).toUpperCase() + monthData.month.slice(1);
        pdfDoc.text(monthName, 20, yPosition);
        yPosition += 8;

        pdfDoc.setFont(undefined, 'normal');
        pdfDoc.setFontSize(9);

        if (monthData.days.length > 0) {
          const tableData = monthData.days.map(day => [
            `${day.dia}`,
            `$${day.ganancia.toFixed(2)}`
          ]);

          autoTable(pdfDoc, {
            head: [['Día', 'Ganancia (MXN)']],
            body: tableData,
            startY: yPosition,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [31, 41, 55], textColor: 255 },
            margin: { left: 20, right: 20 }
          });

          yPosition = (pdfDoc as any).lastAutoTable.finalY + 10;
        }

        pdfDoc.setFont(undefined, 'bold');
        pdfDoc.setFontSize(9);
        pdfDoc.text(`Total ${monthName}: $${monthData.total.toFixed(2)} MXN`, 20, yPosition);
        yPosition += 10;
      });

      addFooter();

      const fileName = `Comprobante_Ingresos_${user.uid}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdfDoc.save(fileName);

      setShowIncomeCertificateConfirm(false);
      setShowIncomeCertificateModal(false);
      setIsGeneratingCertificate(false);
      alert('Comprobante de ingresos generado exitosamente');
    } catch (error) {
      console.error('Error al generar comprobante:', error);
      alert('Error al generar el comprobante');
      setIsGeneratingCertificate(false);
    }
  };

  // **Funciones para manejar el incremento/decremento de pasajeros**
  const handlePassengerChange = (type: 'adultos' | 'ninos', delta: 1 | -1) => {
    setPersonasExtrasConfig(prev => {
      const newValue = Math.max(0, prev[type] + delta);
      const newAdultos = type === 'adultos' ? newValue : prev.adultos;
      const newNinos = type === 'ninos' ? newValue : prev.ninos;
      
      // Calcular el nuevo costo
      const newCost = (newAdultos * 20) + (newNinos * 10);
      
      return {
        active: (newAdultos > 0 || newNinos > 0),
        adultos: newAdultos,
        ninos: newNinos,
        cost: newCost
      };
    });
  };

  // Funciones de estado
  const getStatusColor = () => {
    if (tripData.isRunning) {
      return tripData.isPaused ? 'bg-yellow-400' : 'bg-green-500';
    }
    return gpsStatus === 'available' ? 'bg-blue-400' : 'bg-red-500';
  };

  const getStatusText = () => {
    if (tripData.isRunning) {
      return tripData.isPaused ? 'EN PAUSA - ESPERANDO' : 'VIAJE EN CURSO';
    }
    switch (gpsStatus) {
      case 'available': return 'GPS DISPONIBLE';
      case 'requesting': return 'BUSCANDO SEÑAL GPS...';
      case 'denied': return 'ACCESO GPS DENEGADO';
      case 'unavailable': return 'GPS NO DISPONIBLE';
      default: return 'ESTADO DESCONOCIDO';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 font-sans text-white">
      <InstallPrompt />

      {/* Botón Flotante de Ganancias del Día */}
      <button
        onClick={() => setShowEarningsModal(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-green-600 hover:bg-green-500 text-white rounded-full shadow-lg flex items-center justify-center font-bold text-lg transition duration-200 z-40 border-2 border-green-400"
      >
        ${dailyEarnings.toFixed(0)}
      </button>

      {/* Botón Flotante de Perfil */}
      <button
        onClick={() => setShowUserPanel(true)}
        className="fixed bottom-24 right-6 w-16 h-16 bg-blue-700 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition duration-200 z-40 border-2 border-blue-500"
      >
        <User className="w-8 h-8" />
      </button>

      {/* Botón Flotante Admin (solo visible para admin) */}
      {isAdmin && (
        <button
          onClick={() => setShowAdminModal(true)}
          className="fixed bottom-42 right-6 w-16 h-16 bg-gray-700 hover:bg-gray-600 text-white rounded-full shadow-lg flex items-center justify-center transition duration-200 z-40 border-2 border-red-500"
          title="Panel de Administración"
        >
          <Shield className="w-8 h-8" />
        </button>
      )}

      <div className="max-w-md mx-auto">
        {/* Modal de Ganancias del Día */}
        {showEarningsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-green-500 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">Ganancias del Día</h2>
                <button
                  onClick={() => setShowEarningsModal(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="bg-gray-700 border border-green-500/50 p-6 rounded-lg mb-6 text-center">
                <p className="text-gray-300 text-sm mb-2">Total Acumulado</p>
                <p className="text-5xl font-extrabold text-green-400">
                  ${dailyEarnings.toFixed(0)}
                  <span className="text-lg text-gray-400 ml-2">MXN</span>
                </p>
              </div>
              <button
                onClick={async () => {
                  try {
                    const user = auth.currentUser;
                    if (user && dailyEarnings > 0) {
                      const now = new Date();
                      const meses = [
                        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
                      ];

                      const nombreMes = `${meses[now.getMonth()]}_${now.getFullYear()}`;
                      const userDocRef = doc(db, 'bitacora_ganancias', user.uid);
                      const mesSubcollectionRef = collection(userDocRef, nombreMes);

                      await addDoc(mesSubcollectionRef, {
                        dia: now.getDate(),
                        fecha_cierre: serverTimestamp(),
                        ganancia: dailyEarnings
                      });

                      const earningsRef = doc(db, 'gananciasDiarias', user.uid);
                      await setDoc(earningsRef, {
                        Total: 0
                      });
                    }

                    setDailyEarnings(0);
                    setShowEarningsModal(false);
                  } catch (error) {
                    console.error('Error al guardar bitácora:', error);
                  }
                }}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-xl transition duration-200 mb-2"
              >
                Terminar Día
              </button>
              <button
                onClick={() => setShowEarningsModal(false)}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition duration-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Modal de Ganancias Mensuales */}
        {showMonthlyEarningsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-2">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-blue-500 rounded-xl p-6 w-full h-full shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-white">Ganancias Mensuales</h2>
                <button
                  onClick={() => {
                    setShowMonthlyEarningsModal(false);
                    setSelectedMonth('');
                    setMonthlyEarningsData([]);
                  }}
                  className="text-gray-400 hover:text-white text-4xl"
                >
                  ×
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-gray-300 text-lg mb-2">Selecciona el mes:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    if (e.target.value) {
                      loadMonthlyData(e.target.value);
                    } else {
                      setMonthlyEarningsData([]);
                    }
                  }}
                  className="w-full bg-gray-700 text-white p-4 rounded-lg border border-gray-600 text-lg"
                >
                  <option value="">-- Selecciona un mes --</option>
                  {availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {month.replace('_', ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {selectedMonth && (
                <>
                  <div className="bg-gray-700 border border-blue-500/50 p-6 rounded-lg mb-6">
                    <p className="text-gray-300 text-xl mb-2 text-center">Total del Mes</p>
                    <p className="text-6xl font-extrabold text-blue-400 text-center">
                      ${monthlyEarningsData.reduce((sum, item) => sum + item.ganancia, 0).toFixed(0)}
                      <span className="text-2xl text-gray-400 ml-2">MXN</span>
                    </p>
                  </div>

                  <div className="bg-gray-700 border border-gray-600 rounded-lg p-6 flex-1 overflow-hidden flex flex-col">
                    <h3 className="text-white font-bold mb-4 text-center text-2xl">Ganancias por Día</h3>
                    {monthlyEarningsData.length > 0 ? (
                      <div className="overflow-y-auto flex-1 pr-2">
                        <div className="grid grid-cols-3 gap-4">
                          {monthlyEarningsData.map((item, index) => (
                            <div
                              key={index}
                              className="bg-gray-800 p-4 rounded-lg border border-gray-600 hover:border-blue-500 transition text-center"
                            >
                              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                                <span className="text-white font-bold text-lg">{item.dia}</span>
                              </div>
                              <span className="text-green-400 font-bold text-xl block">${item.ganancia.toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-400 text-center text-xs py-2">No hay datos para este mes</p>
                    )}
                  </div>
                </>
              )}

              <button
                onClick={() => {
                  setShowMonthlyEarningsModal(false);
                  setSelectedMonth('');
                  setMonthlyEarningsData([]);
                }}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-4 rounded-xl transition duration-200 mt-6 text-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Modal de Panel de Usuario */}
        {showUserPanel && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-blue-500 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <User className="w-6 h-6 text-blue-500 mr-2" />
                  <h2 className="text-2xl font-bold text-white">Panel de Usuario</h2>
                </div>
                <button
                  onClick={() => setShowUserPanel(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              <p className="text-gray-300 mb-6 text-center text-sm">Opciones de usuario</p>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowUserPanel(false);
                    setShowUserProfile(true);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition duration-200 text-sm"
                >
                  <div className="flex items-center justify-center">
                    <User className="w-5 h-5 mr-2" />
                    Ver Perfil
                  </div>
                </button>

                <button
                  onClick={async () => {
                    setShowUserPanel(false);
                    await loadAvailableMonths();
                    setShowMonthlyEarningsModal(true);
                  }}
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition duration-200 text-sm"
                >
                  <div className="flex items-center justify-center">
                    <Calendar className="w-5 h-5 mr-2" />
                    Ganancias Mensuales
                  </div>
                </button>

                <button
                  onClick={() => {
                    setShowUserPanel(false);
                    setShowIncomeCertificateModal(true);
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition duration-200 text-sm"
                >
                  <div className="flex items-center justify-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Comprobante de Ingresos
                  </div>
                </button>

                <button
                  onClick={async () => {
                    try {
                      await signOut(auth);
                      setShowUserPanel(false);
                    } catch (error) {
                      console.error('Error al cerrar sesión:', error);
                    }
                  }}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition duration-200 text-sm"
                >
                  <div className="flex items-center justify-center">
                    <LogOut className="w-5 h-5 mr-2" />
                    Salir
                  </div>
                </button>
              </div>

              <button
                onClick={() => setShowUserPanel(false)}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition duration-200 mt-4"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Modal de Confirmación de Comprobante de Ingresos */}
        {showIncomeCertificateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-purple-500 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <FileText className="w-6 h-6 text-purple-500 mr-2" />
                  <h2 className="text-2xl font-bold text-white">Comprobante de Ingresos</h2>
                </div>
                <button
                  onClick={() => setShowIncomeCertificateModal(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              <p className="text-gray-300 mb-6 text-center">Se generará un comprobante de ingresos de los últimos 3 meses</p>

              <div className="space-y-3">
                <button
                  onClick={() => setShowIncomeCertificateConfirm(true)}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition duration-200"
                >
                  Aceptar
                </button>

                <button
                  onClick={() => setShowIncomeCertificateModal(false)}
                  className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition duration-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Confirmación Final */}
        {showIncomeCertificateConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-purple-500 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <h2 className="text-2xl font-bold text-white text-center mb-4">Generando Comprobante</h2>
              <p className="text-gray-300 text-center mb-6">Se descargará un documento PDF con tu comprobante de ingresos de los últimos 3 meses</p>

              <div className="space-y-3">
                <button
                  onClick={generateIncomeCertificate}
                  disabled={isGeneratingCertificate}
                  className={`w-full font-bold py-3 rounded-xl transition duration-200 ${
                    isGeneratingCertificate
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                  }`}
                >
                  {isGeneratingCertificate ? 'Generando...' : 'Confirmar y Descargar'}
                </button>

                <button
                  onClick={() => {
                    setShowIncomeCertificateConfirm(false);
                    setShowIncomeCertificateModal(false);
                  }}
                  disabled={isGeneratingCertificate}
                  className={`w-full font-bold py-3 rounded-xl transition duration-200 ${
                    isGeneratingCertificate
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-600 hover:bg-gray-500 text-white'
                  }`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Perfil de Usuario */}
        {showUserProfile && userData && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-blue-500 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <User className="w-6 h-6 text-blue-500 mr-2" />
                  <h2 className="text-2xl font-bold text-white">Mi Perfil</h2>
                </div>
                <button
                  onClick={() => setShowUserProfile(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Nombre</p>
                  <p className="text-white font-semibold text-lg">{userData.nombre}</p>
                </div>

                <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Email</p>
                  <p className="text-white font-semibold text-sm">{userData.email}</p>
                </div>

                <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Teléfono</p>
                  <p className="text-white font-semibold text-lg">{userData.telefono}</p>
                </div>

                <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">ID Zello</p>
                  <p className="text-white font-semibold text-lg">{userData.idZello}</p>
                </div>

                <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Vehículo</p>
                  <p className="text-white font-semibold text-lg">{userData.vehiculo}</p>
                </div>

                <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Placas</p>
                  <p className="text-white font-semibold text-lg">{userData.placas}</p>
                </div>
              </div>

              <button
                onClick={() => setShowUserProfile(false)}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition duration-200 mt-6"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Modal Admin (solo visible para admin) */}
        {showAdminModal && isAdmin && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-red-500 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Shield className="w-6 h-6 text-red-500 mr-2" />
                  <h2 className="text-2xl font-bold text-white">Panel Admin</h2>
                </div>
                <button
                  onClick={() => setShowAdminModal(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              <p className="text-gray-300 mb-6 text-center text-sm">Funciones administrativas del sistema</p>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    toggleSimulation();
                    setShowAdminModal(false);
                  }}
                  className={`w-full font-bold py-3 rounded-xl transition duration-200 text-sm ${isSimulating ? 'bg-green-600 hover:bg-green-500' : 'bg-yellow-600 hover:bg-yellow-500'} text-white`}
                >
                  <div className="flex items-center justify-center">
                    <Zap className="w-5 h-5 mr-2" />
                    {isSimulating ? 'Detener Simulación' : 'Iniciar Simulación'}
                  </div>
                </button>

                <div className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <Car className="w-5 h-5 text-blue-400 mr-2" />
                      <span className="text-xs font-medium text-gray-300">Tipo de Ruta:</span>
                    </div>
                    <span className="text-sm font-bold text-white">{selectedTripType.name}</span>
                  </div>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <Navigation className="w-5 h-5 text-blue-400 mr-2" />
                      <span className="text-xs font-medium text-gray-300">Zona Especial ($70)</span>
                    </div>
                    <button
                      onClick={() => setIsSorianaActive(!isSorianaActive)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${isSorianaActive ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                    >
                      {isSorianaActive ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={countUsuarios}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition duration-200 text-sm"
                >
                  Contar Usuarios Registrados
                </button>

                {usuariosLoaded && (
                  <div className="bg-green-900 border border-green-500 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-green-300">Usuarios Registrados:</span>
                      <span className="text-2xl font-bold text-green-400">{totalUsuarios}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => alert('Funcionalidad en desarrollo: Ver todos los viajes')}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition duration-200 text-sm"
                >
                  Ver Todos los Viajes
                </button>

                <button
                  onClick={() => alert('Funcionalidad en desarrollo: Configuración avanzada')}
                  className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition duration-200 text-sm"
                >
                  Configuración Avanzada
                </button>
              </div>

              <button
                onClick={() => setShowAdminModal(false)}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition duration-200 mt-4"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Modal de Foraneos */}
        {showForaneosModal && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-blue-500 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">Precios Foráneos</h2>
                <button
                  onClick={() => setShowForaneosModal(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              <p className="text-gray-300 mb-6 text-center">Consulta los precios para viajes foráneos</p>
              <a
                href="https://precios.speedcabszapotlan.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition duration-200 shadow-lg block text-center mb-3"
              >
                Abrir Precios Foráneos
              </a>
              <button
                onClick={() => setShowForaneosModal(false)}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition duration-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Modal de resumen del viaje (Se mantiene igual) */}
        {showSummary && lastTripSummary && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-blue-500 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-center mb-4">
                <MapPinned className="w-8 h-8 text-blue-400 mr-2" />
                <h2 className="text-2xl font-bold text-center text-white">
                  Resumen del Viaje
                </h2>
              </div>
              
              <div className="space-y-4">
                <div className="bg-gray-700 border border-gray-600 p-3 rounded-lg">
                  <div className="text-center">
                    <span className="text-blue-400 font-bold text-lg">{lastTripSummary.tripType}</span>
                  </div>
                </div>

                <div className="bg-gray-700 border border-gray-600 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-300">Distancia recorrida:</span>
                    <span className="font-bold text-lg text-blue-400">{lastTripSummary.distance.toFixed(3)} km</span>
                  </div>

                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-300">Tiempo de espera:</span>
                    <span className="font-bold text-lg text-blue-400">{formatTime(lastTripSummary.waitingTime)}</span>
                  </div>

                  <div className="border-t border-gray-600 pt-3 mt-3">
                    <div className="space-y-2 mb-2">
                      {(() => {
                        const waitingMinutes = Math.floor(lastTripSummary.waitingTime / 60);
                        const waitingCost = waitingMinutes * RATES.waitingRate;
                        const petCost = lastTripSummary.petConfig.active ? lastTripSummary.petConfig.cost : 0;
                        const personasExtrasCost = lastTripSummary.personasExtrasConfig.active ? lastTripSummary.personasExtrasConfig.cost : 0;

                        // Si es zona lejana de Soriana, el costo es fijo de $70
                        const hadSpecialZone = lastTripSummary.isSorianaActive &&
                          Math.abs(lastTripSummary.cost - (70 + lastTripSummary.costoParadas + waitingCost + petCost + personasExtrasCost)) < 1;

                        if (hadSpecialZone) {
                          return (
                            <>
                              {lastTripSummary.numeroParadas > 0 && (
                                <div className="flex justify-between items-center text-sm bg-blue-900/30 p-2 rounded">
                                  <span className="text-blue-300">Paradas ({lastTripSummary.numeroParadas}):</span>
                                  <span className="text-white font-semibold">${lastTripSummary.costoParadas} MXN</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-300">Zona especial (tarifa fija):</span>
                                <span className="text-white font-semibold">$70 MXN</span>
                              </div>
                              {waitingCost > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-300">Tiempo de espera:</span>
                                  <span className="text-white font-semibold">${waitingCost.toFixed(0)} MXN</span>
                                </div>
                              )}
                              {petCost > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-300">Mascota:</span>
                                  <span className="text-white font-semibold">${petCost} MXN</span>
                                </div>
                              )}
                              {personasExtrasCost > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-300">Pasajeros adicionales:</span>
                                  <span className="text-white font-semibold">${personasExtrasCost} MXN</span>
                                </div>
                              )}
                            </>
                          );
                        }

                        // --- Lógica para Viaje Normal / Otras rutas ---

                        let baseFareToUse;
                        if (lastTripSummary.servicioEspecialConfig.active) {
                          baseFareToUse = lastTripSummary.servicioEspecialConfig.cost;
                        } else if (lastTripSummary.tripType.includes('Cristo Rey')) {
                          baseFareToUse = (TRIP_TYPES.find(t => t.name === lastTripSummary.tripType)?.subTrips?.find(st => st.name === lastTripSummary.tripType)?.fixedPrice || RATES.baseFare);
                        } else {
                          baseFareToUse = (TRIP_TYPES.find(t => t.name === lastTripSummary.tripType)?.fixedPrice || RATES.baseFare);
                        }

                        let baseCost = baseFareToUse;
                        let tripTypeExtraFee = 0;

                        // Recalcular baseCost solo para desglose (ya que el total es lastTripSummary.cost)
                        if (lastTripSummary.tripType.includes('Colmena')) {
                            if (lastTripSummary.distance > 4.9) {
                                const kmExtra = lastTripSummary.distance - 4.9;
                                baseCost = 120 + (Math.ceil(kmExtra) * 10);
                            } else {
                                baseCost = 120;
                            }
                        }
                        else if (lastTripSummary.tripType !== 'Viaje Normal') {
                          if (lastTripSummary.distance > 5) {
                            const extraKmAfter5 = lastTripSummary.distance - 5;
                            baseCost += extraKmAfter5 * 10;
                          }
                        } else {
                          for (const rate of RATES.distanceRates) {
                            if (lastTripSummary.distance >= rate.min && lastTripSummary.distance <= rate.max) {
                              if (rate.extraRate && lastTripSummary.distance > 8) {
                                const extraKm = lastTripSummary.distance - 8;
                                const adjustedBasePrice = (rate.basePrice! - RATES.baseFare) + baseFareToUse;
                                baseCost = adjustedBasePrice + (extraKm * rate.extraRate);
                              } else {
                                const priceIncrease = rate.price! - RATES.baseFare;
                                baseCost = baseFareToUse + priceIncrease;
                              }
                              break;
                            }
                          }
                        }

                        if ((lastTripSummary.tripType !== 'Viaje Normal' || (lastTripSummary.isSorianaActive && !lastTripSummary.costoParadas)) && lastTripSummary.distance >= 3.7) {
                          tripTypeExtraFee = 5;
                        }

                        const calculatedBaseFareForDisplay = lastTripSummary.cost - lastTripSummary.costoParadas - waitingCost - petCost - personasExtrasCost - tripTypeExtraFee;

                        return (
                          <>
                            {lastTripSummary.numeroParadas > 0 && (
                              <div className="flex justify-between items-center text-sm bg-blue-900/30 p-2 rounded">
                                <span className="text-blue-300">Paradas ({lastTripSummary.numeroParadas}):</span>
                                <span className="text-white font-semibold">${lastTripSummary.costoParadas} MXN</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-300">Tarifa de ruta:</span>
                              <span className="text-white font-semibold">${calculatedBaseFareForDisplay.toFixed(2)} MXN</span>
                            </div>
                            {waitingCost > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-300">Tiempo de espera:</span>
                                <span className="text-white font-semibold">${waitingCost.toFixed(0)} MXN</span>
                              </div>
                            )}
                            {petCost > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-300">Mascota:</span>
                                <span className="text-white font-semibold">${petCost} MXN</span>
                              </div>
                            )}
                            {personasExtrasCost > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-300">Pasajeros adicionales:</span>
                                <span className="text-white font-semibold">${personasExtrasCost} MXN</span>
                              </div>
                            )}
                            {tripTypeExtraFee > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-300">Cargo adicional (&gt;3.7 km):</span>
                                <span className="text-white font-semibold">${tripTypeExtraFee} MXN</span>
                              </div>
                            )}
                          </>
                        );
                      })()}

                      {/* Total */}
                      <div className="flex justify-between items-center mt-3 border-t border-blue-500/50 pt-3">
                        <span className="text-xl text-white">TOTAL:</span>
                        <span className="text-3xl font-extrabold text-blue-400">${lastTripSummary.cost.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    const newEarnings = dailyEarnings + lastTripSummary.cost;
                    setDailyEarnings(newEarnings);

                    try {
                      const user = auth.currentUser;
                      if (user) {
                        const earningsRef = doc(db, 'gananciasDiarias', user.uid);
                        await setDoc(earningsRef, {
                          Total: newEarnings
                        });
                      }
                    } catch (error) {
                      console.error('Error al guardar ganancias:', error);
                    }

                    setShowSummary(false);

                    const initialTripType = TRIP_TYPES[0];
                    setSelectedTripType(initialTripType);
                    setSelectedSubTrip(null);

                    setTripData({
                      distance: 0,
                      rawDistance: 0,
                      cost: RATES.baseFare,
                      waitingTime: 0,
                      isRunning: false,
                      isPaused: false
                    });

                    setServiciosExtrasActive(false);
                    setPetConfig({
                      active: false,
                      withCage: null,
                      cost: 0
                    });
                    setServicioEspecialConfig({
                      active: false,
                      type: null,
                      cost: 0
                    });
                    setPersonasExtrasConfig({
                      active: false,
                      ninos: 0,
                      adultos: 0,
                      cost: 0
                    });
                    setIsSorianaActive(false);
                    setSelectedSorianaZone(null);
                    setCostoAcumuladoParadas(0);
                    setNumeroParadas(0);
                    setTarifaTipo('normal');
                    setTotalWaitingTime(0);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition duration-200 shadow-lg"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="mb-6">
          <h1 className="text-4xl font-extrabold text-white text-center mb-1 flex items-center justify-center">
            <Activity className="w-8 h-8 text-blue-400 mr-2" />
            <Gauge className="w-8 h-8 text-blue-400 mr-2" />
            Recorrido GPS
          </h1>
          <div className={`text-center py-1.5 px-3 rounded-full text-sm font-semibold text-gray-900 ${getStatusColor()}`}>
            <MapPin className="w-4 h-4 inline-block mr-1" />
            {getStatusText()}
          </div>
          <div className="mt-3 text-center">
            <button
              onClick={() => setShowForaneosModal(true)}
              className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
            >
              Foraneos
            </button>
          </div>
        </header>

        {/* Display Principal */}
        <div className="bg-gray-800 p-6 rounded-2xl shadow-2xl mb-6 border border-gray-700">
          <div className="flex justify-between items-end mb-4">
            <div className="text-left">
              <span className="text-xs font-medium text-blue-400 uppercase">Distancia Recorrida</span>
              <p className="text-4xl font-bold text-white leading-none">
                {tripData.distance.toFixed(3)}
                <span className="text-lg font-normal text-gray-400 ml-1">km</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-blue-400 uppercase">Tiempo de Espera</span>
              <p className="text-2xl font-bold text-white leading-none">
                {formatTime(tripData.waitingTime)}
              </p>
            </div>
          </div>

          <div className="text-center bg-black/50 p-3 rounded-xl border border-blue-500/50">
            <span className="text-xs font-medium text-blue-400 uppercase block">Tarifa Total</span>
            <p className="text-6xl font-extrabold text-blue-400 mt-1">
              ${Math.ceil(tripData.cost).toFixed(0)}
              <span className="text-xl font-normal text-gray-400 ml-1">MXN</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              (Tarifa Base: ${getBasePrice(selectedTripType).toFixed(2)})
            </p>
          </div>
        </div>

        {/* Controles de Viaje (Se mantiene igual) */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {tripData.isRunning ? (
            <>
              {/* Botón de Pausa/Reanudar */}
              <button
                onClick={togglePause}
                className={`flex flex-col items-center justify-center p-3 rounded-xl shadow-lg transition duration-200 ${tripData.isPaused ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-blue-600 hover:bg-blue-500'}`}
              >
                {tripData.isPaused ? (
                  <Play className="w-6 h-6 text-white" />
                ) : (
                  <Pause className="w-6 h-6 text-white" />
                )}
                <span className="text-xs mt-1 font-bold text-white">
                  {tripData.isPaused ? 'Reanudar' : 'Pausar'}
                </span>
              </button>

              {/* Botón de Finalizar Viaje */}
              <button
                onClick={stopTrip}
                className="col-span-2 flex flex-col items-center justify-center p-3 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg transition duration-200"
              >
                <Square className="w-6 h-6" />
                <span className="text-xs mt-1 font-bold">Finalizar</span>
              </button>
            </>
          ) : (
            <>
              {/* Botón de Iniciar Viaje */}
              <button
                onClick={startTrip}
                className={`col-span-3 flex flex-col items-center justify-center p-3 rounded-xl shadow-lg transition duration-200 ${gpsStatus === 'available' ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-600 text-gray-300 cursor-not-allowed'}`}
                disabled={gpsStatus !== 'available'}
              >
                <Play className="w-8 h-8" />
                <span className="text-md mt-1 font-bold">INICIAR VIAJE</span>
              </button>
            </>
          )}
        </div>

        {/* Paradas Intermedias */}
        {tripData.isRunning && (
          <div className="bg-gray-800 p-4 rounded-xl shadow-lg mb-6 border border-gray-700 relative">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center">
              <MapPinned className="w-5 h-5 text-blue-400 mr-2" />
              Paradas
            </h3>
            <div className="flex justify-between items-center text-sm mb-2">
              <span className="text-gray-300">Número de paradas:</span>
              <span className="font-bold text-white">{numeroParadas}</span>
            </div>
            <div className="flex justify-between items-center text-sm mb-4">
              <span className="text-gray-300">Costo acumulado:</span>
              <span className="font-bold text-blue-400">${costoAcumuladoParadas.toFixed(0)} MXN</span>
            </div>

            <button
              onClick={() => setShowParadaSelector(true)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-xl transition duration-200"
              disabled={showParadaSelector}
            >
              Añadir Parada
            </button>
            
            {/* Selector de Tipo de Parada (Modal/Panel) */}
            {showParadaSelector && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4 rounded-xl z-10">
                <div className="bg-gray-700 p-4 rounded-lg w-full max-w-xs shadow-2xl border border-blue-500/50">
                  <h4 className="text-lg font-bold text-white mb-3 text-center">Tipo de Parada:</h4>
                  <div className="space-y-3">
                    <button
                      onClick={() => handleParadaAdd(RATES.paradaRapida)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition duration-150"
                    >
                      <FastForward className="w-5 h-5" />
                      <span className="text-sm">Parada Rápida</span>
                      <span className="text-lg font-extrabold">+${RATES.paradaRapida}</span>
                    </button>
                    <button
                      onClick={() => handleParadaAdd(RATES.paradaServicio, true)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-bold transition duration-150"
                    >
                      <ShoppingBag className="w-5 h-5" />
                      <span className="text-sm">Parada con Servicio</span>
                      <span className="text-lg font-extrabold">+${RATES.paradaServicio}</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setShowParadaSelector(false)}
                    className="w-full mt-4 bg-gray-500 hover:bg-gray-600 text-white text-sm py-2 rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Sección de Servicios Extras */}
        <div className="bg-gray-800 p-4 rounded-xl shadow-lg mb-6 border border-gray-700">
          <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowExtrasSelector(prev => !prev)}>
            <div className="flex items-center">
              <DollarSign className="w-5 h-5 text-blue-400 mr-2" />
              <span className="text-sm font-medium text-gray-300">Servicios Adicionales</span>
            </div>
            {showExtrasSelector ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
          </div>

          {showExtrasSelector && (
            <div className="mt-3 border-t border-gray-700 pt-3 space-y-3">
              {/* Pet Selector */}
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="text-sm text-white">Mascota</span>
                </div>
                <button
                  onClick={() => setShowPetSelector(prev => !prev)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${petConfig.active ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                  disabled={tripData.isRunning}
                >
                  {petConfig.active ? 'Activo' : 'Añadir'}
                </button>
              </div>

              {/* Pet Configuration Modal/Panel */}
              {showPetSelector && (
                <div className="bg-gray-700 p-3 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-300">¿Con jaula/transportadora?</span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setPetConfig({ active: true, withCage: true, cost: 20 });
                          setShowPetSelector(false);
                        }}
                        className={`px-3 py-1 text-xs rounded-full ${petConfig.withCage === true ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                        disabled={tripData.isRunning}
                      >
                        Sí ($20)
                      </button>
                      <button
                        onClick={() => {
                          setPetConfig({ active: true, withCage: false, cost: 30 });
                          setShowPetSelector(false);
                        }}
                        className={`px-3 py-1 text-xs rounded-full ${petConfig.withCage === false ? 'bg-red-500 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                        disabled={tripData.isRunning}
                      >
                        No ($30)
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPetConfig({ active: false, withCage: null, cost: 0 });
                      setShowPetSelector(false);
                    }}
                    className="w-full bg-red-700 text-white text-xs py-1 rounded"
                    disabled={tripData.isRunning}
                  >
                    Eliminar
                  </button>
                </div>
              )}

              {/* Servicio Especial Selector */}
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="text-sm text-white">Servicio Especial</span>
                </div>
                <button
                  onClick={() => setShowServicioEspecialSelector(prev => !prev)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${servicioEspecialConfig.active ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                  disabled={tripData.isRunning}
                >
                  {servicioEspecialConfig.active ? 'Activo' : 'Añadir'}
                </button>
              </div>

              {/* Servicio Especial Configuration Modal/Panel */}
              {showServicioEspecialSelector && (
                <div className="bg-gray-700 p-3 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-300">Selecciona tipo de servicio:</span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setServicioEspecialConfig({ active: true, type: 'recoger', cost: 60 });
                          setShowServicioEspecialSelector(false);
                        }}
                        className={`px-3 py-1 text-xs rounded-full ${servicioEspecialConfig.type === 'recoger' ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                        disabled={tripData.isRunning}
                      >
                        Recoger ($60)
                      </button>
                      <button
                        onClick={() => {
                          setServicioEspecialConfig({ active: true, type: 'comprar', cost: 70 });
                          setShowServicioEspecialSelector(false);
                        }}
                        className={`px-3 py-1 text-xs rounded-full ${servicioEspecialConfig.type === 'comprar' ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                        disabled={tripData.isRunning}
                      >
                        Comprar ($70)
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setServicioEspecialConfig({ active: false, type: null, cost: 0 });
                      setShowServicioEspecialSelector(false);
                    }}
                    className="w-full bg-red-700 text-white text-xs py-1 rounded"
                    disabled={tripData.isRunning}
                  >
                    Eliminar
                  </button>
                </div>
              )}

              {/* Personas Extras Selector */}
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="text-sm text-white">Pasajeros Adicionales</span>
                </div>
                <button
                  onClick={() => setShowPersonasExtrasSelector(prev => !prev)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${personasExtrasConfig.active ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                  disabled={tripData.isRunning}
                >
                  {personasExtrasConfig.active ? 'Activo' : 'Añadir'}
                </button>
              </div>

              {/* Personas Extras Configuration Panel */}
              {showPersonasExtrasSelector && (
                <div className="bg-gray-700 p-3 rounded-lg space-y-2">

                  {/* Control de Adultos */}
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-300">Adultos ($20 c/u):</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handlePassengerChange('adultos', -1)}
                        className={`p-1 rounded-full transition ${personasExtrasConfig.adultos > 0 && !tripData.isRunning ? 'bg-red-500 hover:bg-red-400' : 'bg-gray-600 cursor-not-allowed'}`}
                        disabled={personasExtrasConfig.adultos === 0 || tripData.isRunning}
                      >
                        <Minus className="w-4 h-4 text-white" />
                      </button>
                      <span className="w-6 text-center text-white font-bold text-sm">
                        {personasExtrasConfig.adultos}
                      </span>
                      <button
                        onClick={() => handlePassengerChange('adultos', 1)}
                        className={`p-1 rounded-full transition ${!tripData.isRunning ? 'bg-green-500 hover:bg-green-400' : 'bg-gray-600 cursor-not-allowed'}`}
                        disabled={tripData.isRunning}
                      >
                        <Plus className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>

                  {/* Control de Niños */}
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-300">Niños ($10 c/u):</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handlePassengerChange('ninos', -1)}
                        className={`p-1 rounded-full transition ${personasExtrasConfig.ninos > 0 && !tripData.isRunning ? 'bg-red-500 hover:bg-red-400' : 'bg-gray-600 cursor-not-allowed'}`}
                        disabled={personasExtrasConfig.ninos === 0 || tripData.isRunning}
                      >
                        <Minus className="w-4 h-4 text-white" />
                      </button>
                      <span className="w-6 text-center text-white font-bold text-sm">
                        {personasExtrasConfig.ninos}
                      </span>
                      <button
                        onClick={() => handlePassengerChange('ninos', 1)}
                        className={`p-1 rounded-full transition ${!tripData.isRunning ? 'bg-green-500 hover:bg-green-400' : 'bg-gray-600 cursor-not-allowed'}`}
                        disabled={tripData.isRunning}
                      >
                        <Plus className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>

                  <p className="text-right text-sm font-bold text-blue-400">Costo adicional: ${personasExtrasConfig.cost} MXN</p>
                  <button
                    onClick={() => setShowPersonasExtrasSelector(false)}
                    className="w-full bg-blue-700 text-white text-xs py-1 rounded"
                  >
                    Guardar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sección de Tipo de Tarifa */}
        <div className="bg-gray-800 p-4 rounded-xl shadow-lg mb-6 border border-gray-700 hidden">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Tipo de Tarifa</span>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="tarifaTipo"
                  checked={tarifaTipo === 'normal'}
                  onChange={() => setTarifaTipo('normal')}
                  disabled={tripData.isRunning}
                  className="mr-2 w-4 h-4"
                />
                <span className={`text-sm ${tarifaTipo === 'normal' ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
                  Normal ($50)
                </span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="tarifaTipo"
                  checked={tarifaTipo === 'especial'}
                  onChange={() => setTarifaTipo('especial')}
                  disabled={tripData.isRunning}
                  className="mr-2 w-4 h-4"
                />
                <span className={`text-sm ${tarifaTipo === 'especial' ? 'text-blue-400 font-bold' : 'text-gray-400'}`}>
                  Especial ($60)
                </span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="tarifaTipo"
                  checked={tarifaTipo === 'soriana'}
                  onChange={() => setTarifaTipo('soriana')}
                  disabled={tripData.isRunning}
                  className="mr-2 w-4 h-4"
                />
                <span className={`text-sm ${tarifaTipo === 'soriana' ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>
                  Saliendo de Soriana
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Botón de Rutas */}
        <div className="mb-6">
          <button
            onClick={() => setShowRutasModal(true)}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition duration-200 flex items-center justify-center gap-2"
          >
            Rutas
          </button>
        </div>

        {/* Sección de Tarifas */}
        <div className="bg-gray-800 p-4 rounded-xl shadow-lg mb-6 border border-gray-700">
          <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowRates(prev => !prev)}>
            <div className="flex items-center">
              <Info className="w-5 h-5 text-gray-400 mr-2" />
              <span className="text-sm font-medium text-gray-300">Información de Tarifas</span>
            </div>
            {showRates ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
          </div>

          {showRates && (
            <div className="mt-3 border-t border-gray-700 pt-3 space-y-3 text-sm text-gray-300">
              <p className="font-bold text-white">Tarifa Base: ${(tarifaTipo === 'especial' || tarifaTipo === 'soriana') ? RATES.baseFareEspecial : RATES.baseFare} MXN ({tarifaTipo === 'especial' ? 'Especial' : tarifaTipo === 'soriana' ? 'Saliendo de Soriana' : 'Normal'})</p>
              <p className="font-bold text-white">Costo por Tiempo de Espera: ${RATES.waitingRate} MXN/min</p>

              <h4 className="font-bold text-blue-400 mt-3">Tarifas por Distancia (Viaje Normal):</h4>
              <ul className="list-disc list-inside space-y-1 ml-2">
                {RATES.distanceRates.map((rate, index) => (
                  <li key={index}>
                    {rate.max === Infinity ?
                      `> ${rate.min.toFixed(2)} km: Base $${rate.basePrice} + $${rate.extraRate}/km extra` :
                      `${rate.min.toFixed(2)} - ${rate.max.toFixed(2)} km: $${rate.price} MXN`}
                  </li>
                ))}
              </ul>

            
            </div>
          )}
        </div>
        
        {/* Debug GPS (Se mantiene igual) */}
        <footer className="mt-6 text-center text-xs text-gray-500">
          {currentPosition && (
            <p>
              GPS: Lat {currentPosition.latitude.toFixed(6)}, Lon {currentPosition.longitude.toFixed(6)}
            </p>
          )}
          {tripData.isRunning && (
            <p>
              Distancia Cruda: {tripData.rawDistance.toFixed(3)} km
            </p>
          )}
        
        </footer>

        {showRutasModal && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-blue-500 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">
                  {!selectedRutaCategory ? 'Rutas' : !selectedDestino ? 'Destinos' : 'Alturas'}
                </h2>
                <button
                  onClick={() => {
                    setShowRutasModal(false);
                    setSelectedRutaCategory(null);
                    setSelectedDestino(null);
                  }}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              {!selectedRutaCategory ? (
                <div className="space-y-3">
                  <button
                    onClick={() => setSelectedRutaCategory('viviendas')}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition duration-200"
                  >
                    Viviendas
                  </button>
                  <button
                    onClick={() => {
                      setRouteBaseFare(70);
                      setRouteType('tecnologico');
                      setShowRutasModal(false);
                      setSelectedRutaCategory(null);
                      setSelectedDestino(null);
                    }}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition duration-200"
                  >
                    Tecnológico - $70 + $5/km (después de 5.1km)
                  </button>
                  <button
                    onClick={() => {
                      setRouteBaseFare(60);
                      setRouteType('walmart');
                      setShowRutasModal(false);
                      setSelectedRutaCategory(null);
                      setSelectedDestino(null);
                    }}
                    className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded-xl transition duration-200"
                  >
                    Walmart - $60 + $5/km (después de 4km)
                  </button>
                </div>
              ) : selectedRutaCategory === 'viviendas' && !selectedDestino ? (
                <div className="space-y-2">
                  {[
                    'Pueblito/Pared',
                    'Agricola Paredes',
                    'Tacamo',
                    'Estribo',
                    'Cielo Azul / Cerritos'
                  ].map((destino) => (
                    <button
                      key={destino}
                      onClick={() => setSelectedDestino(destino)}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition duration-200 text-left border border-gray-600"
                    >
                      {destino}
                    </button>
                  ))}
                </div>
              ) : selectedDestino === 'Pueblito/Pared' ? (
                <div className="space-y-2">
                  {[
                    { nombre: 'Altura Tianguis', costo: 60 },
                    { nombre: 'Altura Centro', costo: 80 }
                  ].map((altura) => (
                    <button
                      key={altura.nombre}
                      onClick={() => {
                        setRouteBaseFare(altura.costo);
                        setShowRutasModal(false);
                        setSelectedRutaCategory(null);
                        setSelectedDestino(null);
                      }}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition duration-200 text-left border border-gray-600 flex justify-between items-center"
                    >
                      <span>{altura.nombre}</span>
                      <span className="text-green-400 font-bold">${altura.costo}</span>
                    </button>
                  ))}
                </div>
              ) : selectedDestino === 'Agricola Paredes' ? (
                <div className="space-y-2">
                  {[
                    { nombre: 'Base', costo: 100 },
                    { nombre: 'Centro', costo: 130 }
                  ].map((opcion) => (
                    <button
                      key={opcion.nombre}
                      onClick={() => {
                        setRouteBaseFare(opcion.costo);
                        setShowRutasModal(false);
                        setSelectedRutaCategory(null);
                        setSelectedDestino(null);
                      }}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition duration-200 text-left border border-gray-600 flex justify-between items-center"
                    >
                      <span>{opcion.nombre}</span>
                      <span className="text-green-400 font-bold">${opcion.costo}</span>
                    </button>
                  ))}
                </div>
              ) : selectedDestino === 'Tacamo' ? (
                <div className="space-y-2">
                  {[
                    { nombre: 'Base', costo: 250 },
                    { nombre: 'Centro', costo: 300 }
                  ].map((opcion) => (
                    <button
                      key={opcion.nombre}
                      onClick={() => {
                        setRouteBaseFare(opcion.costo);
                        setShowRutasModal(false);
                        setSelectedRutaCategory(null);
                        setSelectedDestino(null);
                      }}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition duration-200 text-left border border-gray-600 flex justify-between items-center"
                    >
                      <span>{opcion.nombre}</span>
                      <span className="text-green-400 font-bold">${opcion.costo}</span>
                    </button>
                  ))}
                </div>
              ) : selectedDestino === 'Estribo' ? (
                <div className="space-y-2">
                  {[
                    { nombre: 'Base', costo: 100 },
                    { nombre: 'Centro', costo: 130 }
                  ].map((opcion) => (
                    <button
                      key={opcion.nombre}
                      onClick={() => {
                        setRouteBaseFare(opcion.costo);
                        setShowRutasModal(false);
                        setSelectedRutaCategory(null);
                        setSelectedDestino(null);
                      }}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition duration-200 text-left border border-gray-600 flex justify-between items-center"
                    >
                      <span>{opcion.nombre}</span>
                      <span className="text-green-400 font-bold">${opcion.costo}</span>
                    </button>
                  ))}
                </div>
              ) : selectedDestino === 'Cielo Azul / Cerritos' ? (
                <div className="space-y-2">
                  {[
                    { nombre: 'Base', costo: 130 },
                    { nombre: 'Centro', costo: 150 }
                  ].map((opcion) => (
                    <button
                      key={opcion.nombre}
                      onClick={() => {
                        setRouteBaseFare(opcion.costo);
                        setShowRutasModal(false);
                        setSelectedRutaCategory(null);
                        setSelectedDestino(null);
                      }}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition duration-200 text-left border border-gray-600 flex justify-between items-center"
                    >
                      <span>{opcion.nombre}</span>
                      <span className="text-green-400 font-bold">${opcion.costo}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-gray-300 text-center py-4">Sin opciones adicionales</p>
                </div>
              )}

              <button
                onClick={() => {
                  if (selectedDestino) {
                    setSelectedDestino(null);
                  } else if (selectedRutaCategory) {
                    setSelectedRutaCategory(null);
                  } else {
                    setShowRutasModal(false);
                  }
                }}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition duration-200 mt-4"
              >
                {selectedDestino ? 'Atrás' : selectedRutaCategory ? 'Atrás' : 'Cerrar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;