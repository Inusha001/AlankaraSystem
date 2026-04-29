import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";

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
  const ref = await addDoc(collection(db, "customers"), {
    ...customer,
    created_at: serverTimestamp(),
  });
  return ref.id;
}

export async function saveInvoice(invoice) {
  // Strip volatile/derived fields before save (server-side authoritative copy)
  const ref = await addDoc(collection(db, "invoices"), {
    ...invoice,
    saved_at: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchRecentInvoices(max = 50) {
  const q = query(
    collection(db, "invoices"),
    orderBy("saved_at", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}
