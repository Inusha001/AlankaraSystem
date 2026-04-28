import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAXQeOB0g6E7mtTQQRsdkrHPaA55kQPdBg",
  authDomain: "invoicingsystem-a5d98.firebaseapp.com",
  projectId: "invoicingsystem-a5d98",
  storageBucket: "invoicingsystem-a5d98.firebasestorage.app",
  messagingSenderId: "617241754537",
  appId: "1:617241754537:web:14b92fd0488a6c18a162b8",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export async function saveCustomer(customer) {
  // customer: { name, email, phone, sales_person, invoice_number, stock_card, total }
  const ref = await addDoc(collection(db, "customers"), {
    ...customer,
    created_at: serverTimestamp(),
  });
  return ref.id;
}
