// ────────────────────────────────────────────────────────────────
// seed-products.js
//
// Sube los 14 productos a la colección `products` de Firestore.
// Pensado para correr UNA SOLA VEZ al inicializar el proyecto.
// Es idempotente: aborta si ya existen productos para no duplicar.
//
// Uso:
//   node seed-products.js <admin-email> <admin-password>
//
// Ejemplo:
//   node seed-products.js sduartefrelli@prestige-auto.com miPasswordSegura
//
// Las credenciales tienen que ser de un user con doc en `admins/{uid}`
// (las reglas de Firestore exigen que sea admin para escribir en products).
// ────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDocs, collection } from "firebase/firestore";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Mini loader de .env.local (sin agregar deps tipo dotenv) ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  console.error("✗ Falta configuración de Firebase. Asegurate de tener .env.local con las VITE_FIREBASE_* (mirá .env.example).");
  process.exit(1);
}

const PRODUCTS = [
  { id:1,  name:"Bolsa Tote",            cat:"Bolsos",       desc:"Bolsa de tela negra con parche de cuero y logo Mercedes-Benz.",      color:"#1a1a1a", accent:"#b8860b", stock:50, sortIndex:1  },
  { id:2,  name:"Mochila Táctica Negra", cat:"Mochilas",     desc:"Mochila táctica negra con sistema MOLLE y parche metálico.",          color:"#0d0d0d", accent:"#a0a0a0", stock:50, sortIndex:2  },
  { id:3,  name:"Mochila Táctica Arena", cat:"Mochilas",     desc:"Mochila táctica color arena/coyote con múltiples compartimentos.",    color:"#7a6040", accent:"#c8a96e", stock:50, sortIndex:3  },
  { id:4,  name:"Mochila AMG Petronas",  cat:"Mochilas",     desc:"Mochila Adidas × Mercedes-AMG Petronas F1 Team. Edición especial.",   color:"#0a0a0a", accent:"#00D2BE", stock:50, sortIndex:4  },
  { id:5,  name:"Manta de Viaje",        cat:"Hogar",        desc:"Manta artesanal multicolor con flecos y logo bordado Mercedes-Benz.", color:"#2a1525", accent:"#e07070", stock:50, sortIndex:5  },
  { id:6,  name:"Gorra Vito",            cat:"Gorras",       desc:"Gorra negra estructurada con logo Mercedes-Benz y detalle 'Vito'.",   color:"#0a0a0a", accent:"#ffffff", stock:50, sortIndex:6  },
  { id:7,  name:"Gorra Trucker",         cat:"Gorras",       desc:"Gorra trucker negra con logo Mercedes-Benz en relieve al frente.",    color:"#111111", accent:"#e0e0e0", stock:50, sortIndex:7  },
  { id:8,  name:"Remera Prestige Auto",  cat:"Indumentaria", desc:"Remera negra de algodón con estampado Prestige Auto.",                color:"#181818", accent:"#3b82f6", stock:50, sortIndex:8  },
  { id:9,  name:"Botella Estrella",      cat:"Bebidas",      desc:"Botella de vidrio con funda de silicona negra y logo Mercedes-Benz.", color:"#1a1a1a", accent:"#d1d5db", stock:50, sortIndex:9  },
  { id:10, name:"Vaso de Café Largo",    cat:"Bebidas",      desc:"Vaso térmico negro largo de acero inoxidable con logo grabado.",      color:"#141414", accent:"#9ca3af", stock:50, sortIndex:10 },
  { id:11, name:"Vaso de Café Blanco",   cat:"Bebidas",      desc:"Vaso térmico de acero inoxidable blanco con logo Mercedes-Benz.",     color:"#d4d4d4", accent:"#111111", stock:50, sortIndex:11 },
  { id:12, name:"Matera Mochila",        cat:"Mochilas",     desc:"Mochila premium negra con detalles en cuero sintético y logo.",       color:"#0f0f0f", accent:"#6b7280", stock:50, sortIndex:12 },
  { id:13, name:"Set Glamping",          cat:"Lifestyle",    desc:"Set completo para glamping con branding Mercedes-Benz.",              color:"#888888", accent:"#b8860b", stock:50, sortIndex:13 },
  { id:14, name:"Silla de Playa",        cat:"Lifestyle",    desc:"Silla plegable de aluminio con tela Mercedes-Benz y apoyacabezas.",   color:"#1a1a1a", accent:"#c0c0c0", stock:50, sortIndex:14 },
];

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error("Uso: node seed-products.js <admin-email> <admin-password>");
    process.exit(1);
  }

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  console.log(`→ Logueando como ${email}…`);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    console.error("✗ Login falló:", e.code || e.message);
    process.exit(1);
  }
  console.log("✓ Logueado.");

  console.log("→ Verificando si ya hay productos…");
  const existing = await getDocs(collection(db, "products"));
  if (!existing.empty) {
    console.error(`✗ Ya hay ${existing.size} producto(s) en la colección. Abortando para no duplicar.`);
    console.error("  Si querés re-cargar todo desde cero, borrá los docs de `products` desde la consola y volvé a correr el script.");
    await signOut(auth);
    process.exit(1);
  }

  console.log(`→ Subiendo ${PRODUCTS.length} productos…`);
  for (const p of PRODUCTS) {
    await setDoc(doc(db, "products", String(p.id)), p);
    console.log(`  ✓ ${String(p.id).padStart(2)} — ${p.name}`);
  }

  await signOut(auth);
  console.log("✓ Listo. Todos los productos cargados en Firestore.");
  process.exit(0);
}

main().catch(e => {
  console.error("✗ Error inesperado:", e);
  process.exit(1);
});
