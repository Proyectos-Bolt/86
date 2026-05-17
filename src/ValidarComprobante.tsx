import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { CheckCircle, XCircle } from 'lucide-react';

interface DriverData {
  nombre: string;
  telefono: string;
}

const ValidarComprobante: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [averageIncome, setAverageIncome] = useState<number>(0);
  const [monthsData, setMonthsData] = useState<string[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchDriverData = async () => {
      if (!id) {
        setError('ID de conductor no proporcionado');
        setLoading(false);
        return;
      }

      try {
        const userDocRef = doc(db, 'usuarios', id);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          setError('Conductor no encontrado');
          setLoading(false);
          return;
        }

        const userData = userDoc.data();
        setDriverData({
          nombre: userData.nombre || 'N/A',
          telefono: userData.telefono || 'N/A'
        });

        const now = new Date();
        const meses = [
          'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
          'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
        ];

        const months: string[] = [];
        const monthsForDisplay: string[] = [];

        for (let i = 1; i <= 3; i++) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthKey = `${meses[date.getMonth()]}_${date.getFullYear()}`;
          const monthDisplay = `${meses[date.getMonth()].charAt(0).toUpperCase() + meses[date.getMonth()].slice(1)} ${date.getFullYear()}`;
          months.push(monthKey);
          monthsForDisplay.push(monthDisplay);
        }

        setMonthsData(monthsForDisplay);

        let totalIncome = 0;
        let monthsWithData = 0;

        for (const monthKey of months) {
          try {
            const userGananciasRef = doc(db, 'bitacora_ganancias', id);
            const mesSubcollectionRef = collection(userGananciasRef, monthKey);
            const q = query(mesSubcollectionRef, orderBy('dia', 'asc'));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
              querySnapshot.forEach((docSnapshot) => {
                const docData = docSnapshot.data();
                totalIncome += docData.ganancia || 0;
              });
              monthsWithData++;
            }
          } catch (err) {
            console.error(`Error al cargar datos de ${monthKey}:`, err);
          }
        }

        if (monthsWithData > 0) {
          setAverageIncome(totalIncome / 3);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error al validar comprobante:', err);
        setError('Error al cargar los datos');
        setLoading(false);
      }
    };

    fetchDriverData();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="text-white text-xl">Cargando datos de validación...</div>
      </div>
    );
  }

  if (error || !driverData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-red-500 max-w-md w-full">
          <div className="flex items-center justify-center mb-4">
            <XCircle className="w-16 h-16 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-4">Comprobante No Válido</h1>
          <p className="text-gray-300 text-center mb-4">{error}</p>
          <p className="text-gray-400 text-sm text-center">
            Por favor, verifica que el código QR sea válido y pertenezca a un comprobante oficial de SpeedCabsZapotlan S.A.S de C.V.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-green-500 max-w-2xl w-full">
        <div className="flex items-center justify-center mb-6">
          <CheckCircle className="w-20 h-20 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold text-white text-center mb-2">Comprobante Válido</h1>
        <p className="text-green-400 text-center mb-8 text-lg font-semibold">✓ Verificado Oficialmente</p>

        <div className="bg-gray-700 p-6 rounded-xl mb-6 border border-gray-600">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">
            Información del Conductor
          </h2>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 font-medium">Nombre:</span>
              <span className="text-white font-bold text-lg">{driverData.nombre}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-400 font-medium">Teléfono:</span>
              <span className="text-white">{driverData.telefono}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-700 p-6 rounded-xl mb-6 border border-gray-600">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">
            Ingresos Promedio
          </h2>

          <div className="bg-green-900/30 p-4 rounded-lg border border-green-500/50 mb-4">
            <p className="text-gray-300 text-sm mb-2 text-center">Promedio Mensual (Últimos 3 meses)</p>
            <p className="text-4xl font-extrabold text-green-400 text-center">
              ${averageIncome.toFixed(2)}
              <span className="text-lg text-gray-400 ml-2">MXN</span>
            </p>
          </div>

          <div className="text-gray-400 text-sm">
            <p className="mb-2"><span className="font-medium text-white">Período evaluado:</span></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              {monthsData.map((month, index) => (
                <li key={index} className="text-gray-300">{month}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-blue-900/30 p-6 rounded-xl border border-blue-500/50">
          <p className="text-blue-300 text-center text-sm leading-relaxed">
            Esta información coincide con los registros oficiales de
            <span className="font-bold text-white"> SpeedCabsZapotlan S.A.S de C.V.</span>
          </p>
          <p className="text-gray-400 text-center text-xs mt-3">
            Documento verificado mediante código QR oficial
          </p>
        </div>

        <div className="mt-6 text-center">
          <p className="text-gray-500 text-xs">
            Este comprobante es válido únicamente si se accede mediante el código QR oficial proporcionado en el documento impreso.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ValidarComprobante;
