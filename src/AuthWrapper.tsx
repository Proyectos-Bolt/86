import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthWrapperProps {
  children: React.ReactNode;
}

interface UserData {
  email: string;
  idZello: string;
  nombre: string;
  telefono: string;
  vehiculo: string;
  placas: string;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [formData, setFormData] = useState<UserData>({
    email: '',
    idZello: '',
    nombre: '',
    telefono: '',
    vehiculo: '',
    placas: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      (async () => {
        if (currentUser) {
          await checkUserInFirestore(currentUser);
        } else {
          setUser(null);
          setLoading(false);
        }
      })();
    });

    return () => unsubscribe();
  }, []);

  const checkUserInFirestore = async (currentUser: User) => {
    try {
      const userDocRef = doc(db, 'usuarios', currentUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        await setDoc(userDocRef, {
          ultimaConexion: serverTimestamp()
        }, { merge: true });

        setUser(currentUser);
        setLoading(false);
      } else {
        setFormData({
          email: currentUser.email || '',
          idZello: '',
          nombre: currentUser.displayName || '',
          telefono: '',
          vehiculo: '',
          placas: ''
        });
        setShowRegistrationForm(true);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error al verificar usuario:', error);
      setUser(currentUser);
      setLoading(false);
    }
  };

  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!auth.currentUser) return;

    setIsSubmitting(true);

    try {
      const userDocRef = doc(db, 'usuarios', auth.currentUser.uid);

      await setDoc(userDocRef, {
        uid: auth.currentUser.uid,
        email: formData.email,
        idZello: formData.idZello,
        nombre: formData.nombre,
        telefono: formData.telefono,
        vehiculo: formData.vehiculo,
        placas: formData.placas,
        createdAt: serverTimestamp(),
        ultimaConexion: serverTimestamp()
      });

      setUser(auth.currentUser);
      setShowRegistrationForm(false);
    } catch (error) {
      console.error('Error al registrar usuario:', error);
      alert('Error al registrar los datos. Por favor, intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  if (showRegistrationForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full">
          <h1 className="text-3xl font-bold text-white text-center mb-4">Registro de Usuario</h1>
          <p className="text-gray-300 text-center mb-6">Completa tus datos para continuar</p>

          <form onSubmit={handleRegistrationSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">ID Zello</label>
              <input
                type="text"
                value={formData.idZello}
                onChange={(e) => setFormData({ ...formData, idZello: e.target.value })}
                className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
                placeholder="Tu ID de Zello"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">Nombre</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
                placeholder="Nombre completo"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">Teléfono</label>
              <input
                type="tel"
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
                placeholder="Número de teléfono"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">Vehículo</label>
              <input
                type="text"
                value={formData.vehiculo}
                onChange={(e) => setFormData({ ...formData, vehiculo: e.target.value })}
                className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
                placeholder="Marca y modelo (ej: Toyota Corolla)"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">Placas</label>
              <input
                type="text"
                value={formData.placas}
                onChange={(e) => setFormData({ ...formData, placas: e.target.value })}
                className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
                placeholder="Placa del vehículo"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full font-bold py-3 rounded-xl transition duration-200 ${
                isSubmitting
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {isSubmitting ? 'Registrando...' : 'Completar Registro'}
            </button>

            <button
              type="button"
              onClick={() => setShowRegistrationForm(false)}
              disabled={isSubmitting}
              className={`w-full font-bold py-3 rounded-xl transition duration-200 ${
                isSubmitting
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              Cancelar
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full">
          <h1 className="text-3xl font-bold text-white text-center mb-6">Recorrido GPS</h1>
          <p className="text-gray-300 text-center mb-8">Inicia sesión para continuar</p>
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition duration-200 flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Iniciar sesión con Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {React.isValidElement(children) && typeof children.type !== 'string'
        ? React.cloneElement(children as React.ReactElement<any>, { isAdmin: user?.email === 'trabajoonline88@gmail.com' })
        : children
      }
    </div>
  );
};

export default AuthWrapper;
