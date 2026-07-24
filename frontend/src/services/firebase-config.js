/* ================================================================
   ARQUIVO: frontend/src/services/firebase-config.js

   CONCEITO GERAL:
   Configuração central do Firebase.
   Todos os outros arquivos importam daqui — assim o Firebase
   é inicializado UMA única vez em todo o projeto.

   POR QUE CENTRALIZAR?
   Login.jsx, Cadastro.jsx e outros precisam do Firebase.
   Se cada um inicializasse o Firebase separadamente, daria
   erro "app já existe". Centralizando, todos compartilham
   a mesma instância.
================================================================ */

import { initializeApp, getApps } from 'firebase/app';
import { getAuth }                 from 'firebase/auth';
import { getFirestore }            from 'firebase/firestore';

const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Inicializa só uma vez — evita erro "app já existe"
const app = getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0];

export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;
