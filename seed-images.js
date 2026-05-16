// ────────────────────────────────────────────────────────────────
// seed-images.js
//
// Sube todas las imágenes de la carpeta /images/ a Firebase Storage
// y actualiza el campo `imageUrl` de cada producto en Firestore.
//
// Convención de nombres dentro de /images/:
//   1.jpg, 2.jpg, ..., 14.jpg   →  fotos de productos (id = nombre archivo)
//   logo.jpg / logo.png         →  logo del header
//   hero.jpg / hero.png         →  imagen del banner principal de la home
//
// Acepta extensiones: .jpg .jpeg .png .webp .gif
//
// Uso:
//   node seed-images.js <admin-email> <admin-password>
//
// Ejemplo:
//   node seed-images.js sduartefrelli@prestige-auto.com miPasswordSegura
// ────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Mini loader de .env.local ──
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
  console.error("✗ Falta configuración de Firebase (.env.local).");
  process.exit(1);
}

const VALID_EXTS  = ["jpg", "jpeg", "png", "webp", "gif"];
const MIME_BY_EXT = {
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  gif:  "image/gif",
};

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error("Uso: node seed-images.js <admin-email> <admin-password>");
    process.exit(1);
  }

  const imagesDir = path.join(__dirname, "images");
  if (!fs.existsSync(imagesDir)) {
    console.error(`✗ No encuentro la carpeta /images/ en ${__dirname}`);
    console.error("  Creá la carpeta y poné adentro: 1.jpg, 2.jpg, ..., 14.jpg, logo.jpg");
    process.exit(1);
  }

  const files = fs.readdirSync(imagesDir).filter(f => {
    const ext = f.split(".").pop()?.toLowerCase();
    return VALID_EXTS.includes(ext);
  });

  if (files.length === 0) {
    console.error("✗ /images/ está vacía o no tiene imágenes válidas (jpg/png/webp/gif).");
    process.exit(1);
  }

  console.log(`→ Encontré ${files.length} imagen(es) en /images/`);

  const app     = initializeApp(firebaseConfig);
  const auth    = getAuth(app);
  const db      = getFirestore(app);
  const storage = getStorage(app);

  console.log(`→ Logueando como ${email}…`);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    console.error("✗ Login falló:", e.code || e.message);
    process.exit(1);
  }
  console.log("✓ Logueado.");

  let okCount = 0;
  let skipCount = 0;
  let errCount = 0;

  for (const file of files) {
    const ext  = file.split(".").pop().toLowerCase();
    let base   = file.slice(0, -(ext.length + 1));
    // Tolera doble extensión tipo "1.jpg.png" (caso común en Windows
    // cuando renombrás con extensiones ocultas). Limpia .jpg/.jpeg/etc.
    // intermedias para quedarse solo con el nombre real.
    while (true) {
      const m = base.match(/^(.+)\.(jpg|jpeg|png|webp|gif)$/i);
      if (!m) break;
      base = m[1];
    }
    const filePath = path.join(imagesDir, file);
    const buffer   = fs.readFileSync(filePath);
    const sizeMB   = (buffer.length / (1024 * 1024)).toFixed(2);

    if (buffer.length > 5 * 1024 * 1024) {
      console.warn(`  ⊘ ${file} (${sizeMB} MB) — excede el límite de 5MB de las reglas. Salteando.`);
      skipCount++;
      continue;
    }

    try {
      if (base === "logo") {
        const storagePath = `branding/logo.${ext}`;
        const sref = ref(storage, storagePath);
        await uploadBytes(sref, buffer, { contentType: MIME_BY_EXT[ext] });
        const url = await getDownloadURL(sref);
        await setDoc(doc(db, "config", "branding"), { logoUrl: url }, { merge: true });
        console.log(`  ✓ ${file} (${sizeMB} MB) → ${storagePath} → config/branding.logoUrl`);
        okCount++;
      } else if (base === "hero") {
        const storagePath = `branding/hero.${ext}`;
        const sref = ref(storage, storagePath);
        await uploadBytes(sref, buffer, { contentType: MIME_BY_EXT[ext] });
        const url = await getDownloadURL(sref);
        await setDoc(doc(db, "config", "branding"), { heroUrl: url }, { merge: true });
        console.log(`  ✓ ${file} (${sizeMB} MB) → ${storagePath} → config/branding.heroUrl`);
        okCount++;
      } else if (/^\d+$/.test(base)) {
        const productId   = base; // "1", "2", ..., "14"
        const productRef  = doc(db, "products", productId);
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
          console.warn(`  ⊘ ${file} → no existe el producto con id="${productId}". Salteando.`);
          skipCount++;
          continue;
        }
        const storagePath = `products/${productId}.${ext}`;
        const sref = ref(storage, storagePath);
        await uploadBytes(sref, buffer, { contentType: MIME_BY_EXT[ext] });
        const url = await getDownloadURL(sref);
        await setDoc(productRef, { imageUrl: url }, { merge: true });
        console.log(`  ✓ ${file} (${sizeMB} MB) → ${storagePath} → products/${productId}.imageUrl`);
        okCount++;
      } else {
        console.warn(`  ⊘ ${file} → nombre no reconocido. Tiene que ser "1.jpg"…"14.jpg" o "logo.jpg". Salteando.`);
        skipCount++;
      }
    } catch (e) {
      console.error(`  ✗ ${file} → error:`, e.code || e.message);
      errCount++;
    }
  }

  await signOut(auth);
  console.log("\n──────────────────────────────");
  console.log(`✓ ${okCount} OK · ⊘ ${skipCount} salteadas · ✗ ${errCount} con error`);
  process.exit(errCount > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("✗ Error inesperado:", e);
  process.exit(1);
});
