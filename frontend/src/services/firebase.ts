import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// Firebase configuration from environment variables with fallbacks for production
const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    "AIzaSyDdzURk5KJykQwmtUdOg-Lbdj4HjUT9G8g",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "dhakadsnazzy2.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dhakadsnazzy2",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "dhakadsnazzy2.firebasestorage.app",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "88524532800",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    "1:88524532800:web:347183dc062e619a48c3a5",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-GCPBFW3F1B",
};

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

// Initialize Firebase Cloud Messaging
let messaging: any = null;

if (app) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.warn("Firebase Messaging not supported in this browser:", error);
  }
}

export { messaging, getToken, onMessage };
export default app;
