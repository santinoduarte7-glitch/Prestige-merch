import React, { useState, useMemo, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

// ── FIREBASE CONFIG ──────────────────────────────────────────
// Lee desde import.meta.env (Vite) si están seteadas, sino usa los
// valores hardcodeados como fallback. Las API keys de Firebase Web son
// PÚBLICAS por diseño (van inlineadas en el bundle del cliente). La
// seguridad real está en las reglas de Firestore + Auth.
// Docs: https://firebase.google.com/docs/projects/api-keys
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyAHUJYUN-HqRTXvW00HmoTQY48JMHDt6t0",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "prestige-merch-2ad1a.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "prestige-merch-2ad1a",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "prestige-merch-2ad1a.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "644078388510",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:644078388510:web:3cbb556f4d38135c39350f",
};
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);
const storage     = getStorage(firebaseApp);
const auth        = getAuth(firebaseApp);

// ── CONFIGURACIÓN ──────────────────────────────────────────────
const STATUS_OPT = ["Pendiente", "En proceso", "Entregado"];
const ST = {
  "Pendiente":  { bg:"#2d1f00", text:"#fbbf24", dot:"#f59e0b", border:"#92400e" },
  "En proceso": { bg:"#0c1a2e", text:"#60a5fa", dot:"#3b82f6", border:"#1e40af" },
  "Entregado":  { bg:"#022c1a", text:"#34d399", dot:"#10b981", border:"#065f46" },
};

// ── EMAIL ──────────────────────────────────────────────────────
const ADMIN_NOTIFICATION_EMAIL = "sduartefrelli@prestige-auto.com";

// Escapa HTML para evitar inyección en el email
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Manda 1 email resumen al admin con todos los items del checkout.
async function sendCheckoutEmail({ name, area, email, reason, date, items }) {
  try {
    const itemsRows = items.map(it => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee"><b>${esc(it.product.name)}</b><br/><span style="color:#888;font-size:12px">${esc(it.product.cat || "")}</span></td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;font-size:16px;font-weight:600">${it.quantity}</td>
      </tr>`).join("");
    const totalUnits = items.reduce((s, it) => s + it.quantity, 0);
    const subject = items.length === 1
      ? `Nuevo pedido: ${items[0].product.name} (×${items[0].quantity}) — ${name}`
      : `Nuevo pedido: ${items.length} productos (${totalUnits} unidades) — ${name}`;
    await addDoc(collection(db, "mail"), {
      to: ADMIN_NOTIFICATION_EMAIL,
      message: {
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;color:#222">
            <h2 style="color:#1d4ed8;margin:0 0 16px">Nuevo pedido recibido</h2>
            <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:18px">
              <tr><td style="padding:6px 8px;color:#666;width:120px">Solicitante</td><td style="padding:6px 8px">${esc(name)}</td></tr>
              <tr><td style="padding:6px 8px;color:#666">Área</td><td style="padding:6px 8px">${esc(area)}</td></tr>
              <tr><td style="padding:6px 8px;color:#666">Email</td><td style="padding:6px 8px"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
              <tr><td style="padding:6px 8px;color:#666">Fecha</td><td style="padding:6px 8px">${esc(date)}</td></tr>
              <tr><td style="padding:6px 8px;color:#666;vertical-align:top">Motivo</td><td style="padding:6px 8px;white-space:pre-wrap">${esc(reason)}</td></tr>
            </table>
            <h3 style="margin:0 0 8px;color:#444">Productos pedidos</h3>
            <table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #eee">
              <thead>
                <tr style="background:#fafafa">
                  <th style="text-align:left;padding:8px;border-bottom:2px solid #eee">Producto</th>
                  <th style="text-align:center;padding:8px;border-bottom:2px solid #eee;width:80px">Cantidad</th>
                </tr>
              </thead>
              <tbody>${itemsRows}</tbody>
              <tfoot>
                <tr style="background:#fafafa"><td style="padding:8px;font-weight:600">Total</td><td style="padding:8px;text-align:center;font-weight:600">${totalUnits} u.</td></tr>
              </tfoot>
            </table>
            <p style="margin-top:20px;font-size:12px;color:#888">Ingresá al panel de admin para procesar este pedido.</p>
          </div>
        `,
      },
    });
  } catch (e) {
    console.error("Error enviando notificación:", e);
  }
}

// ── COMPONENTES ────────────────────────────────────────────────
const MBStar = ({ size = 18, color = "#888" }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="5"/>
    <line x1="50" y1="4"  x2="50" y2="52" stroke={color} strokeWidth="6" strokeLinecap="round"/>
    <line x1="6"  y1="75" x2="50" y2="52" stroke={color} strokeWidth="6" strokeLinecap="round"/>
    <line x1="94" y1="75" x2="50" y2="52" stroke={color} strokeWidth="6" strokeLinecap="round"/>
  </svg>
);

const BRAND_LABEL = "Mercedes-Benz";

const PrestigeLogo = ({ logoUrl, onClick }) => (
  <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:12, cursor: onClick ? "pointer" : "default" }}>
    {logoUrl
      ? <img src={logoUrl} alt="Prestige Auto" style={{ height:34, objectFit:"contain" }}/>
      : <>
          <MBStar size={28} color="#fff"/>
          <div style={{ lineHeight:1.1 }}>
            <div style={{ fontWeight:300, fontSize:15, letterSpacing:"0.06em", color:"#fff" }}>
              prestige <span style={{ fontWeight:500, color:"#3b82f6" }}>auto</span>
            </div>
            <div style={{ fontSize:8, letterSpacing:"0.28em", color:"#5b5b5b", textTransform:"uppercase", marginTop:2 }}>Catálogo Corporativo</div>
          </div>
        </>
    }
  </div>
);

// ── APP ────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]             = useState("store");
  const [cat, setCat]               = useState("Todos");
  const [orders, setOrders]         = useState([]);
  const [products, setProducts]     = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [logoUrl, setLogoUrl]       = useState(null);
  const [heroUrl, setHeroUrl]       = useState(null);
  const [selected, setSelected]     = useState(null);
  const [detailQty, setDetailQty]   = useState(1);
  const [cart, setCart]             = useState(() => {
    try { return JSON.parse(localStorage.getItem("prestige_cart") || "[]"); } catch { return []; }
  });
  const [cartOpen, setCartOpen]     = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [form, setForm]             = useState({ name:"", area:"", email:"", reason:"" });
  const [formErr, setFormErr]       = useState("");
  const [sending, setSending]       = useState(false);
  const [success, setSuccess]       = useState("");
  const [adminEmail, setAdminEmail]   = useState("");
  const [adminPass,  setAdminPass]    = useState("");
  const [adminErr,   setAdminErr]     = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin,    setIsAdmin]      = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [search, setSearch]         = useState("");
  const [statusF, setStatusF]       = useState("Todos");
  const [expandedId, setExpandedId] = useState(null);
  const [adminTab, setAdminTab]     = useState("orders");
  const [uploading, setUploading]   = useState(false);
  const [editingProduct, setEditingProduct] = useState(null); // null = no abierto, {} = nuevo, {...} = editando
  const [productForm, setProductForm]   = useState({ name:"", cat:"", desc:"", color:"#1a1a1a", accent:"#3b82f6", stock:0 });
  const [productFormErr, setProductFormErr] = useState("");
  const [productSaving, setProductSaving]   = useState(false);
  const fileRefs = useRef({});

  // Escuchar pedidos en tiempo real desde Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "orders"), snap => {
      const data = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
      data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOrders(data);
    });
    return () => unsub();
  }, []);

  // Cargar productos desde Firestore en tiempo real
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.sortIndex ?? 999) - (b.sortIndex ?? 999));
      setProducts(data);
      setProductsLoading(false);
    }, err => {
      console.error("Error leyendo productos:", err);
      setProductsLoading(false);
    });
    return () => unsub();
  }, []);

  // Cargar logo y hero desde config/branding
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "branding"), snap => {
      const data = snap.exists() ? snap.data() : {};
      setLogoUrl(data.logoUrl || null);
      setHeroUrl(data.heroUrl || null);
    });
    return () => unsub();
  }, []);

  // Escuchar cambios de auth y verificar si el user es admin
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const adminDoc = await getDoc(doc(db, "admins", user.uid));
          setIsAdmin(adminDoc.exists());
        } catch (e) {
          console.error("Error verificando admin:", e);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const cats = useMemo(() => ["Todos", ...new Set(products.map(p => p.cat).filter(Boolean))], [products]);
  const filteredProd = cat === "Todos" ? products : products.filter(p => p.cat === cat);

  // Persistir carrito en localStorage
  useEffect(() => {
    try { localStorage.setItem("prestige_cart", JSON.stringify(cart)); } catch {}
  }, [cart]);

  // Carrito enriquecido con datos del producto (filtra items cuyo producto fue eliminado)
  const cartItems = useMemo(() =>
    cart
      .map(c => ({ ...c, product: products.find(p => String(p.id) === String(c.productId)) }))
      .filter(c => c.product),
    [cart, products]
  );
  const cartCount = cartItems.reduce((sum, c) => sum + c.quantity, 0);

  const addToCart = (productId, qty = 1) => {
    const product = products.find(p => String(p.id) === String(productId));
    if (!product) return;
    const stock = Number.isFinite(product.stock) ? product.stock : Infinity;
    setCart(curr => {
      const existing = curr.find(c => String(c.productId) === String(productId));
      if (existing) {
        const newQty = Math.min(stock, existing.quantity + qty);
        return curr.map(c => String(c.productId) === String(productId) ? { ...c, quantity: newQty } : c);
      }
      return [...curr, { productId: String(productId), quantity: Math.min(qty, stock) }];
    });
    // Feedback rápido
    setSuccess(`✅ ${product.name} agregado al carrito`);
    setTimeout(() => setSuccess(""), 2500);
  };

  const updateCartQty = (productId, qty) => {
    const n = parseInt(qty);
    if (!Number.isInteger(n) || n < 0) return;
    if (n === 0) { removeFromCart(productId); return; }
    const product = products.find(p => String(p.id) === String(productId));
    const stock = Number.isFinite(product?.stock) ? product.stock : Infinity;
    const safe = Math.min(n, stock);
    setCart(curr => curr.map(c => String(c.productId) === String(productId) ? { ...c, quantity: safe } : c));
  };

  const removeFromCart = (productId) => {
    setCart(curr => curr.filter(c => String(c.productId) !== String(productId)));
  };

  const clearCart = () => setCart([]);

  // ── Detalle de producto ──
  const openDetail = (p) => {
    setSelected(p);
    // Inicializar cantidad: 1, o lo que ya tenga en el carrito, o el máximo del stock
    const inCart = cart.find(c => String(c.productId) === String(p.id))?.quantity || 0;
    const stock  = Number.isFinite(p.stock) ? p.stock : Infinity;
    setDetailQty(Math.max(1, Math.min(stock - inCart, 1)));
  };
  const closeDetail = () => setSelected(null);
  const addDetailToCart = () => {
    if (!selected) return;
    addToCart(selected.id, detailQty);
    closeDetail();
  };

  // ESC cierra el modal de detalle / carrito / checkout
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (checkoutOpen)      setCheckoutOpen(false);
      else if (selected)     closeDetail();
      else if (cartOpen)     setCartOpen(false);
      else if (editingProduct) closeProductForm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checkoutOpen, selected, cartOpen, editingProduct]);

  const filteredOrders = useMemo(() => {
    let list = [...orders];
    if (statusF !== "Todos") list = list.filter(o => o.status === statusF);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.name?.toLowerCase().includes(q) ||
        o.product?.toLowerCase().includes(q) ||
        o.area?.toLowerCase().includes(q) ||
        o.email?.toLowerCase().includes(q) ||
        o.reason?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, statusF, search]);

  const openCheckout = () => {
    if (cartItems.length === 0) return;
    setFormErr("");
    setCheckoutOpen(true);
  };

  const submitCheckout = async () => {
    setFormErr("");
    if (!form.name.trim() || !form.area.trim() || !form.email.trim() || !form.reason.trim()) { setFormErr("Completá todos los campos."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setFormErr("Email inválido."); return; }
    if (cartItems.length === 0) { setFormErr("Tu carrito está vacío."); return; }
    setSending(true);
    try {
      const date = new Date().toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric" });
      const timestamp = Date.now();
      // Crear 1 doc en orders por cada item del carrito
      for (const item of cartItems) {
        await addDoc(collection(db, "orders"), {
          ...form,
          product:   item.product.name,
          productId: String(item.product.id),
          quantity:  item.quantity,
          status:    "Pendiente",
          date,
          timestamp,
        });
      }
      // Email resumen una sola vez
      await sendCheckoutEmail({ ...form, date, items: cartItems });
      const totalUnits = cartItems.reduce((s, c) => s + c.quantity, 0);
      setSuccess(`✅ Pedido enviado: ${cartItems.length} producto${cartItems.length>1?"s":""} (${totalUnits} unidad${totalUnits>1?"es":""}).`);
      clearCart();
      setForm({ name:"", area:"", email:"", reason:"" });
      setCheckoutOpen(false);
      setCartOpen(false);
    } catch (e) {
      setFormErr("Error al enviar el pedido. Intentá de nuevo.");
      console.error(e);
    } finally {
      setSending(false);
      setTimeout(() => setSuccess(""), 6000);
    }
  };

  const updateStatus = async (firestoreId, status) => {
    await updateDoc(doc(db, "orders", firestoreId), { status });
  };

  const handleImageUpload = async (key, file) => {
    if (!file) return;
    setUploading(true);
    try {
      // Detectar extensión real del archivo (jpg, png, webp, etc.)
      const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';

      if (key === "logo") {
        // /branding/logo.{ext}  →  config/branding.logoUrl
        const storageRef = ref(storage, `branding/logo.${ext}`);
        await uploadBytes(storageRef, file, { contentType: file.type });
        const url = await getDownloadURL(storageRef);
        await setDoc(doc(db, "config", "branding"), { logoUrl: url }, { merge: true });
      } else if (key === "hero") {
        // /branding/hero.{ext}  →  config/branding.heroUrl
        const storageRef = ref(storage, `branding/hero.${ext}`);
        await uploadBytes(storageRef, file, { contentType: file.type });
        const url = await getDownloadURL(storageRef);
        await setDoc(doc(db, "config", "branding"), { heroUrl: url }, { merge: true });
      } else {
        // /products/{id}.{ext}  →  products/{id}.imageUrl
        const storageRef = ref(storage, `products/${key}.${ext}`);
        await uploadBytes(storageRef, file, { contentType: file.type });
        const url = await getDownloadURL(storageRef);
        await setDoc(doc(db, "products", String(key)), { imageUrl: url }, { merge: true });
      }
    } catch (e) {
      console.error("Error subiendo imagen:", e);
      alert("Error al subir la imagen: " + (e.message || e.code || "desconocido"));
    }
    setUploading(false);
  };

  const handleAdminLogin = async () => {
    setAdminErr("");
    if (!adminEmail.trim() || !adminPass) { setAdminErr("Completá email y contraseña."); return; }
    try {
      const cred = await signInWithEmailAndPassword(auth, adminEmail.trim(), adminPass);
      const adminDoc = await getDoc(doc(db, "admins", cred.user.uid));
      if (!adminDoc.exists()) {
        await signOut(auth);
        setAdminErr("Este usuario no tiene permisos de admin.");
        return;
      }
      setAdminEmail(""); setAdminPass("");
      setView("admin");
    } catch (e) {
      if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found")
        setAdminErr("Email o contraseña incorrectos.");
      else if (e.code === "auth/too-many-requests")
        setAdminErr("Demasiados intentos. Intentá de nuevo más tarde.");
      else
        setAdminErr("Error al iniciar sesión: " + e.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView("store");
  };

  // ── CRUD de productos ──
  const openNewProductForm = () => {
    setEditingProduct({});
    setProductForm({ name:"", cat:"", desc:"", color:"#1a1a1a", accent:"#3b82f6", stock:0 });
    setProductFormErr("");
  };

  const openEditProductForm = (p) => {
    setEditingProduct(p);
    setProductForm({
      name:   p.name   || "",
      cat:    p.cat    || "",
      desc:   p.desc   || "",
      color:  p.color  || "#1a1a1a",
      accent: p.accent || "#3b82f6",
      stock:  Number.isFinite(p.stock) ? p.stock : 0,
    });
    setProductFormErr("");
  };

  const closeProductForm = () => {
    setEditingProduct(null);
    setProductFormErr("");
  };

  const saveProduct = async () => {
    setProductFormErr("");
    if (!productForm.name.trim() || !productForm.cat.trim() || !productForm.desc.trim()) {
      setProductFormErr("Nombre, categoría y descripción son obligatorios.");
      return;
    }
    if (productForm.stock < 0 || !Number.isInteger(Number(productForm.stock))) {
      setProductFormErr("Stock tiene que ser un número entero ≥ 0.");
      return;
    }
    setProductSaving(true);
    try {
      const isNew = !editingProduct?.id;
      const data = {
        name:   productForm.name.trim(),
        cat:    productForm.cat.trim(),
        desc:   productForm.desc.trim(),
        color:  productForm.color,
        accent: productForm.accent,
        stock:  Number(productForm.stock),
      };
      if (isNew) {
        // Próximo ID disponible (max + 1, mínimo 15)
        const maxId = products.reduce((m, p) => Math.max(m, parseInt(p.id) || 0), 0);
        const nextId = String(Math.max(maxId + 1, 15));
        const nextSort = products.reduce((m, p) => Math.max(m, p.sortIndex || 0), 0) + 1;
        await setDoc(doc(db, "products", nextId), { ...data, sortIndex: nextSort });
      } else {
        await updateDoc(doc(db, "products", String(editingProduct.id)), data);
      }
      closeProductForm();
    } catch (e) {
      setProductFormErr("Error al guardar: " + (e.message || e.code));
    }
    setProductSaving(false);
  };

  const deleteProduct = async (p) => {
    if (!confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      // Intentar borrar la imagen del Storage (si existe). Si falla, seguimos.
      if (p.imageUrl) {
        // Inferimos la path del Storage: products/{id}.{ext}
        const ext = p.imageUrl.match(/\/products%2F\d+\.(\w+)\?/)?.[1];
        if (ext) {
          try { await deleteObject(ref(storage, `products/${p.id}.${ext}`)); } catch (_) { /* puede no existir */ }
        }
      }
      await deleteDoc(doc(db, "products", String(p.id)));
    } catch (e) {
      alert("Error al eliminar: " + (e.message || e.code));
    }
  };

  const updateStock = async (id, newStock) => {
    const n = parseInt(newStock);
    if (!Number.isInteger(n) || n < 0) return;
    try {
      await updateDoc(doc(db, "products", String(id)), { stock: n });
    } catch (e) {
      alert("Error actualizando stock: " + (e.message || e.code));
    }
  };

  const s   = { fontFamily:"'Inter','Helvetica Neue',sans-serif", minHeight:"100vh", background:"#080808", color:"#f3f4f6" };
  const inp = { width:"100%", boxSizing:"border-box", padding:"11px 14px", background:"#141414", border:"1px solid #2a2a2a", borderRadius:10, color:"#f3f4f6", fontSize:14, outline:"none", fontFamily:"inherit" };
  const lbl = { display:"block", fontSize:10, fontWeight:600, color:"#6b7280", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 };

  return (
    <div style={s}>
      {/* HEADER */}
      <header style={{ background:"#000", borderBottom:"1px solid #1a1a1a", padding:"0 28px", display:"flex", alignItems:"center", justifyContent:"space-between", height:72, position:"sticky", top:0, zIndex:100 }}>
        <PrestigeLogo logoUrl={logoUrl} onClick={()=>setView("store")}/>
        <div style={{ display:"flex", gap:20, alignItems:"center" }}>
          {/* Admin / user icon */}
          <button onClick={()=>{ if(view==="admin"){setView("store");return;} setView(currentUser && isAdmin ? "admin" : "adminLogin"); }}
            aria-label={view==="admin" ? "Salir del admin" : "Ingresar al admin"} title={view==="admin" ? "Volver a la tienda" : "Panel admin"}
            style={{ background:"transparent", border:"none", color: view==="admin" ? "#3b82f6" : "#9ca3af", fontSize:18, cursor:"pointer", padding:4, display:"inline-flex", alignItems:"center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/>
            </svg>
          </button>
          {/* Cart icon (solo en store) */}
          {view === "store" && (
            <button onClick={()=>setCartOpen(true)} aria-label="Abrir carrito" title="Carrito"
              style={{ position:"relative", background:"transparent", border:"none", color:"#fff", cursor:"pointer", padding:4, display:"inline-flex", alignItems:"center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {cartCount > 0 && (
                <span style={{ position:"absolute", top:-4, right:-6, background:"#1d4ed8", color:"#fff", fontSize:9, fontWeight:600, minWidth:16, height:16, borderRadius:8, padding:"0 4px", display:"inline-flex", alignItems:"center", justifyContent:"center", border:"2px solid #000" }}>{cartCount > 99 ? "99+" : cartCount}</span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* CATEGORY NAV (solo en store) */}
      {view === "store" && cats.length > 1 && (
        <nav style={{ background:"#0a0a0a", borderBottom:"1px solid #1a1a1a", padding:"0 28px", display:"flex", gap:24, height:48, alignItems:"center", overflowX:"auto", position:"sticky", top:72, zIndex:99 }}>
          {cats.map(c => {
            const active = cat === c;
            return (
              <button key={c} onClick={()=>setCat(c)} style={{
                background:"transparent", border:"none", padding:"16px 0 14px",
                fontSize:11, fontWeight:500, letterSpacing:".18em", textTransform:"uppercase",
                color: active ? "#fff" : "#9ca3af",
                borderBottom: active ? "1px solid #3b82f6" : "1px solid transparent",
                marginBottom:-1, cursor:"pointer", whiteSpace:"nowrap",
              }}>{c}</button>
            );
          })}
        </nav>
      )}

      {/* ADMIN LOGIN */}
      {view==="adminLogin" && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"82vh", padding:20 }}>
          <div style={{ background:"#0f0f0f", border:"1px solid #1f1f1f", borderRadius:20, padding:"40px 36px", width:"100%", maxWidth:380 }}>
            <div style={{ textAlign:"center", marginBottom:28 }}>
              <MBStar size={42} color="#3b82f6"/>
              <h2 style={{ margin:"14px 0 6px", fontSize:20, fontWeight:700 }}>Panel Administrativo</h2>
              <p style={{ margin:0, color:"#6b7280", fontSize:13 }}>Ingresá con tu cuenta para continuar</p>
            </div>
            <label style={lbl}>Email</label>
            <input type="email" autoComplete="email" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} style={{...inp,marginBottom:14}} placeholder="admin@empresa.com"/>
            <label style={lbl}>Contraseña</label>
            <input type="password" autoComplete="current-password" value={adminPass} onChange={e=>setAdminPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} style={{...inp,marginBottom:8}} placeholder="••••••••"/>
            {adminErr && <p style={{ color:"#f87171", fontSize:12, margin:"0 0 10px" }}>{adminErr}</p>}
            <button onClick={handleAdminLogin} disabled={authLoading} style={{ width:"100%", padding:"12px", marginTop:8, background:"linear-gradient(135deg,#1d4ed8,#1e40af)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:600, cursor:authLoading?"wait":"pointer" }}>
              {authLoading ? "Cargando…" : "Ingresar"}
            </button>
          </div>
        </div>
      )}

      {/* STORE */}
      {view==="store" && (
        <>
          {/* Toast success flotante */}
          {success && (
            <div style={{ position:"fixed", top:140, left:"50%", transform:"translateX(-50%)", zIndex:150, background:"#052e16", border:"1px solid #166534", borderRadius:12, padding:"12px 20px", color:"#4ade80", fontSize:13, fontWeight:500, boxShadow:"0 8px 24px rgba(0,0,0,0.5)" }}>{success}</div>
          )}

          {/* HERO */}
          <section style={{ position:"relative", height:380, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden",
            background: heroUrl ? `linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${heroUrl}) center/cover no-repeat` : "linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 50%,#0a0a0a 100%)" }}>
            {!heroUrl && (
              <>
                <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 30% 50%, #1e3a5f 0%, transparent 60%), radial-gradient(ellipse at 75% 60%, #1a1a1a 0%, #000 70%)", opacity:.85 }}/>
                <div style={{ position:"absolute", right:"6%", top:"50%", transform:"translateY(-50%)", opacity:.04 }}>
                  <MBStar size={300} color="#fff"/>
                </div>
              </>
            )}
            <div style={{ position:"relative", textAlign:"center", zIndex:1, padding:"0 20px" }}>
              <div style={{ fontSize:11, letterSpacing:".4em", color:"#3b82f6", textTransform:"uppercase", marginBottom:14 }}>Catálogo 2026</div>
              <h1 style={{ margin:"0 0 14px", fontSize:46, fontWeight:300, letterSpacing:".02em", color:"#fff", lineHeight:1.1 }}>
                Merchandising <span style={{ fontWeight:500, color:"#3b82f6" }}>oficial</span>
              </h1>
              <p style={{ margin:"0 auto", fontSize:14, color:"#9ca3af", maxWidth:440, lineHeight:1.7 }}>
                Indumentaria y accesorios.
              </p>
            </div>
          </section>

          <main style={{ maxWidth:1240, margin:"0 auto", padding:"40px 28px 32px" }}>
            <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:28, paddingBottom:16, borderBottom:"1px solid #1a1a1a" }}>
              <h2 style={{ margin:0, fontSize:14, fontWeight:500, letterSpacing:".04em", color:"#fff" }}>{cat === "Todos" ? "Productos disponibles" : cat}</h2>
              <span style={{ fontSize:11, color:"#6b7280" }}>{filteredProd.length} artículo{filteredProd.length!==1?"s":""}</span>
            </div>
          {productsLoading ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#4b5563", fontSize:14 }}>Cargando productos…</div>
          ) : products.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#4b5563", fontSize:14 }}>No hay productos cargados todavía.</div>
          ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:20 }}>
            {filteredProd.map(p => {
              const img = p.imageUrl;
              const stock = Number.isFinite(p.stock) ? p.stock : null;
              const noStock = stock === 0;
              const lowStock = stock !== null && stock > 0 && stock <= 5;
              const stockColor = noStock ? "#f87171" : lowStock ? "#fbbf24" : "#34d399";
              const stockIcon = noStock ? "✕" : lowStock ? "!" : "✓";
              return (
                <article key={p.id} style={{ background:"#0a0a0a", border:"1px solid #1a1a1a", borderRadius:12, overflow:"hidden", display:"flex", flexDirection:"column", transition:"border-color .2s, transform .2s", opacity:noStock?0.85:1 }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#2a2a2a"; e.currentTarget.style.transform="translateY(-2px)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#1a1a1a"; e.currentTarget.style.transform="translateY(0)";}}>
                  <div onClick={()=>openDetail(p)} title="Ver detalle"
                    style={{ aspectRatio:"4/3", background:img?"#000":`radial-gradient(ellipse at 40% 40%, ${p.color} 0%, #050505 100%)`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden", cursor:"pointer" }}>
                    {img ? <img src={img} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover", filter: noStock ? "grayscale(0.5) opacity(0.7)" : "none", transition:"transform .3s" }} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.04)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}/> : <div style={{ opacity:.15 }}><MBStar size={80} color={p.accent}/></div>}
                    <div style={{ position:"absolute", top:12, right:12, background:"#000c", borderRadius:14, padding:"3px 10px", fontSize:9, color:"#9ca3af", border:"0.5px solid #2a2a2a", textTransform:"uppercase", letterSpacing:".1em" }}>{p.cat}</div>
                    {noStock && <div style={{ position:"absolute", top:12, left:12, background:"#7f1d1d", borderRadius:14, padding:"3px 10px", fontSize:9, color:"#fca5a5", border:"0.5px solid #991b1b", fontWeight:500, textTransform:"uppercase", letterSpacing:".06em" }}>Sin stock</div>}
                    {lowStock && <div style={{ position:"absolute", top:12, left:12, background:"#78350f", borderRadius:14, padding:"3px 10px", fontSize:9, color:"#fcd34d", border:"0.5px solid #92400e", fontWeight:500, textTransform:"uppercase", letterSpacing:".06em" }}>Últimas {stock}</div>}
                  </div>
                  <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", flex:1 }}>
                    <div onClick={()=>openDetail(p)} style={{ cursor:"pointer", marginBottom:10 }}>
                      <div style={{ fontSize:9, color:"#3b82f6", letterSpacing:".18em", textTransform:"uppercase", marginBottom:6 }}>{BRAND_LABEL}</div>
                      <h3 style={{ margin:"0 0 4px", fontSize:14, fontWeight:500, color:"#fff" }}>{p.name}</h3>
                      <p style={{ margin:0, fontSize:11, color:"#6b7280", lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{p.desc}</p>
                    </div>
                    <div style={{ flex:1 }}/>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginTop:6 }}>
                      {stock !== null ? (
                        <span style={{ fontSize:10, color:stockColor, fontWeight:500, display:"inline-flex", alignItems:"center", gap:5 }}>
                          <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:14, height:14, borderRadius:"50%", background:`${stockColor}22`, fontSize:9 }}>{stockIcon}</span>
                          {noStock ? "0 disp." : `${stock} disp.`}
                        </span>
                      ) : <span/>}
                      <button onClick={(e)=>{e.stopPropagation(); if(!noStock) addToCart(p.id, 1);}} disabled={noStock}
                        style={{ background:noStock?"#1f1f1f":"#fff", color:noStock?"#4b5563":"#000", border:"none", borderRadius:14, padding:"7px 14px", fontSize:11, fontWeight:500, cursor:noStock?"not-allowed":"pointer", letterSpacing:".04em" }}>
                        {noStock ? "Sin stock" : "Agregar +"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          )}
          </main>

          {/* FOOTER */}
          <footer style={{ background:"#0a0a0a", borderTop:"1px solid #1a1a1a", padding:"32px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:14, marginTop:40 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:500, color:"#fff", letterSpacing:".06em", marginBottom:4 }}>Prestige Auto · Representante oficial de Mercedes-Benz en Argentina</div>
              <div style={{ fontSize:10, color:"#6b7280" }}>Catálogo de uso interno.</div>
            </div>
            <div style={{ display:"flex", gap:18, fontSize:10, color:"#6b7280" }}>
              <a href={`mailto:${ADMIN_NOTIFICATION_EMAIL}`} style={{ color:"#9ca3af", textDecoration:"none" }}>Soporte</a>
              <span>·</span>
              <span>v1.0 · 2026</span>
            </div>
          </footer>
        </>
      )}

      {/* ADMIN */}
      {view==="admin" && isAdmin && (
        <main style={{ maxWidth:1000, margin:"0 auto", padding:"32px 20px" }}>
          <div style={{ marginBottom:24, paddingBottom:20, borderBottom:"1px solid #1a1a1a", display:"flex", alignItems:"flex-end", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <h1 style={{ margin:"0 0 4px", fontSize:22, fontWeight:700 }}>Panel de Administración</h1>
              <p style={{ margin:0, color:"#6b7280", fontSize:13 }}>{orders.length} pedido{orders.length!==1?"s":""} registrado{orders.length!==1?"s":""} · {currentUser?.email}</p>
            </div>
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              {[{id:"orders",label:"📋 Pedidos"},{id:"productsCrud",label:"🛍️ Productos"},{id:"images",label:"🖼️ Imágenes"}].map(t=>(
                <button key={t.id} onClick={()=>setAdminTab(t.id)} style={{ padding:"8px 16px", borderRadius:8, fontSize:13, fontWeight:500, border:"1px solid", cursor:"pointer",
                  background:adminTab===t.id?"linear-gradient(135deg,#1d4ed8,#1e40af)":"transparent",
                  color:adminTab===t.id?"#fff":"#9ca3af", borderColor:adminTab===t.id?"#1d4ed8":"#2a2a2a" }}>{t.label}</button>
              ))}
              <button onClick={handleLogout} style={{ padding:"8px 14px", borderRadius:8, fontSize:13, fontWeight:500, border:"1px solid #2a2a2a", background:"transparent", color:"#9ca3af", cursor:"pointer" }}>Cerrar sesión</button>
            </div>
          </div>

          {adminTab==="orders" && (<>
            <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:220, position:"relative" }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#6b7280" }}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar…" style={{...inp,paddingLeft:36}}/>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {["Todos",...STATUS_OPT].map(s=>(
                  <button key={s} onClick={()=>setStatusF(s)} style={{ padding:"8px 14px", borderRadius:20, fontSize:11, fontWeight:500, cursor:"pointer", border:"1px solid",
                    background:statusF===s?"#1d4ed8":"transparent", color:statusF===s?"#fff":"#9ca3af", borderColor:statusF===s?"#1d4ed8":"#2a2a2a" }}>{s}</button>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginBottom:24 }}>
              {STATUS_OPT.map(s=>{ const st=ST[s]; return (
                <div key={s} style={{ flex:1, background:st.bg, border:`1px solid ${st.border}`, borderRadius:12, padding:"12px 16px", textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:700, color:st.text }}>{orders.filter(o=>o.status===s).length}</div>
                  <div style={{ fontSize:11, color:st.text, opacity:.7, marginTop:2 }}>{s}</div>
                </div>
              ); })}
            </div>
            {filteredOrders.length===0
              ? <div style={{ textAlign:"center", padding:"70px 0", color:"#374151" }}><p style={{ marginTop:16, fontSize:14 }}>No hay pedidos aún.</p></div>
              : <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {filteredOrders.map(o=>{ const st=ST[o.status]; const exp=expandedId===o.firestoreId; return (
                    <div key={o.firestoreId} style={{ background:"#0f0f0f", border:`1px solid ${exp?"#2a2a2a":"#1a1a1a"}`, borderRadius:14, overflow:"hidden" }}>
                      <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:14, cursor:"pointer", flexWrap:"wrap" }} onClick={()=>setExpandedId(exp?null:o.firestoreId)}>
                        <div style={{ flex:1, minWidth:160 }}>
                          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:2 }}>
                            <span style={{ fontWeight:600, fontSize:14 }}>{o.name}</span>
                            <span style={{ color:"#4b5563" }}>·</span>
                            <span style={{ fontSize:13, color:"#9ca3af" }}>{o.area}</span>
                          </div>
                          <div style={{ fontSize:13, color:"#3b82f6", fontWeight:500 }}>{o.product}{o.quantity > 1 && <span style={{ color:"#9ca3af", marginLeft:6 }}>× {o.quantity}</span>}</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontSize:11, color:"#4b5563" }}>{o.date}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ width:6, height:6, borderRadius:"50%", background:st.dot }}/>
                            <select value={o.status} onChange={e=>{e.stopPropagation();updateStatus(o.firestoreId,e.target.value)}} onClick={e=>e.stopPropagation()}
                              style={{ background:st.bg, color:st.text, border:`1px solid ${st.border}44`, borderRadius:20, padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", outline:"none" }}>
                              {STATUS_OPT.map(s=><option key={s} value={s} style={{background:"#111",color:"#fff"}}>{s}</option>)}
                            </select>
                          </div>
                          <span style={{ color:"#6b7280", transform:exp?"rotate(180deg)":"none" }}>▾</span>
                        </div>
                      </div>
                      {exp && (
                        <div style={{ borderTop:"1px solid #1a1a1a", padding:"18px", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:16 }}>
                          {[{l:"Nombre",v:o.name},{l:"Área",v:o.area},{l:"Email",v:o.email},{l:"Producto",v:o.product},{l:"Cantidad",v:o.quantity || 1},{l:"Fecha",v:o.date},{l:"Estado",v:o.status},{l:"Motivo",v:o.reason,full:true}].map(f=>(
                            <div key={f.l} style={f.full?{gridColumn:"1/-1"}:{}}>
                              <div style={{ fontSize:10, fontWeight:600, color:"#4b5563", textTransform:"uppercase", marginBottom:4 }}>{f.l}</div>
                              <div style={{ fontSize:13, color:"#9ca3af", background:"#141414", border:"1px solid #1f1f1f", borderRadius:8, padding:"8px 12px" }}>{f.v}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ); })}
                </div>
            }
          </>)}

          {adminTab==="productsCrud" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, flexWrap:"wrap", gap:10 }}>
                <p style={{ color:"#6b7280", fontSize:13, margin:0 }}>{products.length} producto{products.length!==1?"s":""} en la tienda. Cambios en vivo.</p>
                <button onClick={openNewProductForm} style={{ padding:"9px 18px", background:"linear-gradient(135deg,#1d4ed8,#1e40af)", color:"#fff", border:"none", borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>+ Nuevo producto</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {products.map(p => {
                  const img = p.imageUrl;
                  const stock = Number.isFinite(p.stock) ? p.stock : null;
                  const stockColor = stock === null ? "#6b7280" : stock === 0 ? "#f87171" : stock <= 5 ? "#fbbf24" : "#34d399";
                  return (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:14, background:"#0f0f0f", border:"1px solid #1a1a1a", borderRadius:14, padding:14, flexWrap:"wrap" }}>
                      <div style={{ fontSize:10, color:"#4b5563", fontWeight:700, width:24, textAlign:"center" }}>#{p.id}</div>
                      <div style={{ width:56, height:56, borderRadius:8, background:img?"#000":"#141414", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                        {img ? <img src={img} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <MBStar size={22} color={p.accent}/>}
                      </div>
                      <div style={{ flex:1, minWidth:160 }}>
                        <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>{p.name}</div>
                        <div style={{ fontSize:12, color:"#6b7280" }}>{p.cat}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:10, color:"#6b7280", fontWeight:600, textTransform:"uppercase", letterSpacing:".1em" }}>Stock</span>
                        <input
                          type="number" min="0"
                          defaultValue={stock ?? ""}
                          onBlur={e => { if (e.target.value !== "" && Number(e.target.value) !== stock) updateStock(p.id, e.target.value); }}
                          style={{ width:56, padding:"6px 8px", background:"#141414", border:`1px solid ${stockColor}55`, borderRadius:8, color:stockColor, fontSize:13, fontWeight:600, textAlign:"center", outline:"none" }}
                        />
                      </div>
                      <input ref={el=>fileRefs.current[`p_${p.id}`]=el} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleImageUpload(p.id,e.target.files[0])}/>
                      <button onClick={()=>fileRefs.current[`p_${p.id}`]?.click()} disabled={uploading} title="Subir/cambiar foto"
                        style={{ padding:"7px 12px", background:"#141414", border:"1px solid #2a2a2a", borderRadius:8, color:"#9ca3af", fontSize:12, cursor:"pointer" }}>
                        {uploading?"…":"📷"}
                      </button>
                      <button onClick={()=>openEditProductForm(p)} title="Editar"
                        style={{ padding:"7px 12px", background:"#141414", border:"1px solid #2a2a2a", borderRadius:8, color:"#9ca3af", fontSize:12, cursor:"pointer" }}>
                        ✏️
                      </button>
                      <button onClick={()=>deleteProduct(p)} title="Eliminar"
                        style={{ padding:"7px 12px", background:"#141414", border:"1px solid #2a2a2a", borderRadius:8, color:"#f87171", fontSize:12, cursor:"pointer" }}>
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {adminTab==="images" && (
            <div>
              <p style={{ color:"#6b7280", fontSize:13, marginBottom:24 }}>Logo del header y foto del banner principal de la home. Las fotos de productos se manejan en la pestaña Productos.</p>
              {[
                { key:"logo", label:"Logo del Header", desc:"Se muestra en la barra superior.", url:logoUrl, w:80, h:60, fit:"contain" },
                { key:"hero", label:"Imagen Hero",      desc:"Banner principal de la home.",      url:heroUrl, w:120, h:60, fit:"cover" },
              ].map(item => (
                <div key={item.key} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#6b7280", textTransform:"uppercase", marginBottom:10 }}>{item.label}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:16, background:"#0f0f0f", border:"1px solid #1a1a1a", borderRadius:14, padding:16 }}>
                    <div style={{ width:item.w, height:item.h, borderRadius:10, background:"#141414", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
                      {item.url ? <img src={item.url} alt={item.label} style={{width:"100%",height:"100%",objectFit:item.fit}}/> : <span style={{color:"#333",fontSize:22}}>{item.key==="hero"?"🖼️":"🏢"}</span>}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:14 }}>{item.label}</div>
                      <div style={{ fontSize:12, color:"#6b7280" }}>{item.desc}</div>
                    </div>
                    <input ref={el=>fileRefs.current[item.key]=el} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleImageUpload(item.key,e.target.files[0])}/>
                    <button onClick={()=>fileRefs.current[item.key]?.click()} disabled={uploading}
                      style={{ padding:"8px 16px", background:item.url?"#141414":"linear-gradient(135deg,#1d4ed8,#1e40af)", border:"1px solid", borderColor:item.url?"#2a2a2a":"#1d4ed8", borderRadius:10, color:"#fff", fontSize:13, cursor:"pointer" }}>
                      {uploading?"Subiendo…":item.url?"Cambiar":"Subir"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* PRODUCT DETAIL MODAL */}
      {selected && (() => {
        const p = selected;
        const stock = Number.isFinite(p.stock) ? p.stock : null;
        const noStock = stock === 0;
        const inCart = cart.find(c => String(c.productId) === String(p.id))?.quantity || 0;
        const maxAddable = stock === null ? 99 : Math.max(0, stock - inCart);
        const safeQty = Math.min(detailQty, maxAddable || 1);
        return (
          <div onClick={closeDetail} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20, backdropFilter:"blur(8px)" }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"#0f0f0f", border:"1px solid #1f1f1f", borderRadius:20, width:"100%", maxWidth:920, maxHeight:"92vh", overflow:"hidden", display:"flex", flexDirection:"column" }}>
              {/* Header con close */}
              <div style={{ position:"absolute", top:24, right:24, zIndex:10 }}>
                <button onClick={closeDetail} aria-label="Cerrar" style={{ width:36, height:36, borderRadius:"50%", background:"#0a0a0acc", border:"1px solid #2a2a2a", color:"#fff", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>×</button>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", flex:1, minHeight:0 }}>
                {/* Imagen */}
                <div style={{ flex:"1 1 320px", minHeight:280, background: p.imageUrl ? "#000" : `radial-gradient(ellipse at 40% 40%, ${p.color || "#1a1a1a"} 0%, #050505 100%)`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", maxHeight:"70vh" }}>
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.name} style={{ width:"100%", height:"100%", maxHeight:"70vh", objectFit:"contain", filter: noStock ? "grayscale(0.5) opacity(0.7)" : "none" }}/>
                    : <div style={{ opacity:.18 }}><MBStar size={140} color={p.accent}/></div>
                  }
                  {noStock && (
                    <div style={{ position:"absolute", top:20, left:20, background:"#7f1d1d", borderRadius:20, padding:"6px 14px", fontSize:11, color:"#fca5a5", border:"1px solid #991b1b", fontWeight:700 }}>SIN STOCK</div>
                  )}
                </div>
                {/* Info */}
                <div style={{ flex:"1 1 300px", padding:"32px 32px 28px", display:"flex", flexDirection:"column", gap:14, overflowY:"auto", maxHeight:"70vh" }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#3b82f6", textTransform:"uppercase", letterSpacing:".15em" }}>{p.cat || "—"}</div>
                  <h2 style={{ margin:0, fontSize:24, fontWeight:700, lineHeight:1.2 }}>{p.name}</h2>
                  {stock !== null && (
                    <div style={{ display:"inline-flex", alignItems:"center", gap:8, alignSelf:"flex-start" }}>
                      <span style={{ width:8, height:8, borderRadius:"50%", background: noStock ? "#f87171" : stock <= 5 ? "#fbbf24" : "#34d399" }}/>
                      <span style={{ fontSize:12, color: noStock ? "#f87171" : stock <= 5 ? "#fbbf24" : "#34d399", fontWeight:500 }}>
                        {noStock ? "Sin stock disponible" : `${stock} unidad${stock!==1?"es":""} disponible${stock!==1?"s":""}`}
                      </span>
                    </div>
                  )}
                  <p style={{ margin:0, fontSize:14, color:"#9ca3af", lineHeight:1.65 }}>{p.desc}</p>
                  {inCart > 0 && (
                    <div style={{ background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, padding:"10px 14px", fontSize:12, color:"#6b7280" }}>
                      Ya tenés <b style={{color:"#3b82f6"}}>{inCart}</b> en el carrito.
                    </div>
                  )}
                  <div style={{ flex:1 }}/>
                  {/* Selector cantidad + add */}
                  {!noStock && maxAddable > 0 && (
                    <>
                      <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:8 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:"#6b7280", textTransform:"uppercase", letterSpacing:".1em" }}>Cantidad</span>
                        <div style={{ display:"flex", alignItems:"center", gap:0, border:"1px solid #2a2a2a", borderRadius:10, overflow:"hidden" }}>
                          <button onClick={()=>setDetailQty(Math.max(1, safeQty-1))} disabled={safeQty<=1} style={{ width:36, height:36, background:"#141414", border:"none", color:safeQty<=1?"#374151":"#9ca3af", fontSize:16, cursor:safeQty<=1?"not-allowed":"pointer" }}>−</button>
                          <input type="number" min="1" max={maxAddable} value={safeQty} onChange={e=>{const n=parseInt(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=maxAddable)setDetailQty(n);}}
                            style={{ width:60, height:36, padding:"0 8px", background:"#0a0a0a", border:"none", borderLeft:"1px solid #2a2a2a", borderRight:"1px solid #2a2a2a", color:"#fff", fontSize:14, fontWeight:600, textAlign:"center", outline:"none" }}/>
                          <button onClick={()=>setDetailQty(Math.min(maxAddable, safeQty+1))} disabled={safeQty>=maxAddable} style={{ width:36, height:36, background:"#141414", border:"none", color:safeQty>=maxAddable?"#374151":"#9ca3af", fontSize:16, cursor:safeQty>=maxAddable?"not-allowed":"pointer" }}>+</button>
                        </div>
                        {stock !== null && <span style={{ fontSize:11, color:"#4b5563" }}>máx {maxAddable}</span>}
                      </div>
                      <button onClick={addDetailToCart}
                        style={{ width:"100%", padding:"14px", background:"linear-gradient(135deg,#1d4ed8,#1e40af)", color:"#fff", border:"none", borderRadius:12, fontSize:14, fontWeight:600, cursor:"pointer", marginTop:4 }}>
                        Agregar {safeQty > 1 ? `${safeQty} unidades` : "al carrito"}
                      </button>
                    </>
                  )}
                  {!noStock && maxAddable === 0 && stock !== null && (
                    <div style={{ background:"#1a1300", border:"1px solid #78350f", borderRadius:10, padding:"12px 14px", fontSize:12, color:"#fcd34d" }}>
                      Tenés todas las unidades disponibles ({stock}) en el carrito.
                    </div>
                  )}
                  {noStock && (
                    <button disabled style={{ width:"100%", padding:"14px", background:"#1f1f1f", color:"#4b5563", border:"none", borderRadius:12, fontSize:14, fontWeight:600, cursor:"not-allowed" }}>
                      Sin stock
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CART DRAWER */}
      {cartOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:200 }}>
          <div onClick={()=>setCartOpen(false)} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)" }}/>
          <aside style={{ position:"absolute", top:0, right:0, bottom:0, width:"100%", maxWidth:420, background:"#0a0a0a", borderLeft:"1px solid #1f1f1f", display:"flex", flexDirection:"column" }}>
            <header style={{ padding:"18px 22px", borderBottom:"1px solid #1a1a1a", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:16 }}>Tu carrito</div>
                <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{cartCount} unidad{cartCount!==1?"es":""} · {cartItems.length} producto{cartItems.length!==1?"s":""}</div>
              </div>
              <button onClick={()=>setCartOpen(false)} style={{ background:"transparent", border:"none", color:"#9ca3af", fontSize:22, cursor:"pointer", padding:4 }}>×</button>
            </header>
            <div style={{ flex:1, overflowY:"auto", padding:"16px 22px" }}>
              {cartItems.length === 0 ? (
                <div style={{ textAlign:"center", padding:"80px 20px", color:"#4b5563" }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🛒</div>
                  <p style={{ margin:0, fontSize:14 }}>Tu carrito está vacío.</p>
                  <p style={{ margin:"6px 0 0", fontSize:12, color:"#374151" }}>Agregá productos desde la tienda.</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {cartItems.map(it => {
                    const stock = Number.isFinite(it.product.stock) ? it.product.stock : Infinity;
                    return (
                      <div key={it.productId} style={{ display:"flex", gap:12, background:"#0f0f0f", border:"1px solid #1a1a1a", borderRadius:12, padding:12 }}>
                        <div style={{ width:60, height:60, borderRadius:8, background:it.product.imageUrl?"#000":"#141414", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {it.product.imageUrl ? <img src={it.product.imageUrl} alt={it.product.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <MBStar size={22} color={it.product.accent}/>}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:600, fontSize:13, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.product.name}</div>
                          <div style={{ fontSize:11, color:"#6b7280", marginBottom:8 }}>{it.product.cat}</div>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <button onClick={()=>updateCartQty(it.productId, it.quantity - 1)} style={{ width:26, height:26, borderRadius:6, background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#9ca3af", fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                            <input type="number" min="1" max={Number.isFinite(stock)?stock:undefined} value={it.quantity} onChange={e=>updateCartQty(it.productId, e.target.value)}
                              style={{ width:48, padding:"4px 6px", background:"#141414", border:"1px solid #2a2a2a", borderRadius:6, color:"#fff", fontSize:13, fontWeight:600, textAlign:"center", outline:"none" }}/>
                            <button onClick={()=>updateCartQty(it.productId, it.quantity + 1)} disabled={it.quantity >= stock} style={{ width:26, height:26, borderRadius:6, background:"#1a1a1a", border:"1px solid #2a2a2a", color:it.quantity >= stock ? "#374151" : "#9ca3af", fontSize:14, cursor:it.quantity >= stock ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
                            {Number.isFinite(stock) && <span style={{ fontSize:10, color:"#4b5563", marginLeft:4 }}>de {stock}</span>}
                            <button onClick={()=>removeFromCart(it.productId)} title="Eliminar" style={{ marginLeft:"auto", background:"transparent", border:"none", color:"#6b7280", fontSize:16, cursor:"pointer" }}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {cartItems.length > 0 && (
              <footer style={{ padding:"16px 22px", borderTop:"1px solid #1a1a1a" }}>
                <button onClick={openCheckout}
                  style={{ width:"100%", padding:"14px", background:"linear-gradient(135deg,#1d4ed8,#1e40af)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  Finalizar pedido →
                </button>
                <button onClick={clearCart} style={{ width:"100%", padding:"10px", marginTop:8, background:"transparent", color:"#6b7280", border:"none", fontSize:12, cursor:"pointer" }}>
                  Vaciar carrito
                </button>
              </footer>
            )}
          </aside>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {checkoutOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:20, backdropFilter:"blur(6px)" }}>
          <div style={{ background:"#0f0f0f", border:"1px solid #1f1f1f", borderRadius:20, width:"100%", maxWidth:440, overflow:"hidden", maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
            <div style={{ background:"#0a0a0a", padding:"20px 24px", borderBottom:"1px solid #1a1a1a" }}>
              <div style={{ fontWeight:700, fontSize:16 }}>Finalizar pedido</div>
              <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{cartCount} unidad{cartCount!==1?"es":""} · {cartItems.length} producto{cartItems.length!==1?"s":""}</div>
            </div>
            <div style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:14, overflowY:"auto" }}>
              {[{k:"name",l:"Nombre completo",p:"Ej: María González"},{k:"area",l:"Área / Sector",p:"Ej: Comunicación"},{k:"email",l:"Email corporativo",p:"nombre@empresa.com.ar",t:"email"}].map(f=>(
                <div key={f.k}>
                  <label style={lbl}>{f.l}</label>
                  <input type={f.t||"text"} placeholder={f.p} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} style={inp}/>
                </div>
              ))}
              <div>
                <label style={lbl}>¿Por qué querés este merch?</label>
                <textarea placeholder="Ej: Para el evento de lanzamiento…" value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={3} style={{...inp,resize:"none"}}/>
              </div>
              {formErr && <p style={{ color:"#f87171", fontSize:12, margin:0 }}>{formErr}</p>}
            </div>
            <div style={{ padding:"16px 24px", borderTop:"1px solid #1a1a1a", display:"flex", gap:10 }}>
              <button onClick={()=>setCheckoutOpen(false)} style={{ flex:1, padding:"12px", background:"transparent", border:"1px solid #2a2a2a", borderRadius:10, color:"#9ca3af", fontSize:14, cursor:"pointer" }}>← Volver</button>
              <button onClick={submitCheckout} disabled={sending} style={{ flex:2, padding:"12px", background:sending?"#374151":"linear-gradient(135deg,#1d4ed8,#1e40af)", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:600, cursor:sending?"wait":"pointer" }}>
                {sending?"Enviando…":"Enviar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CRUD PRODUCTO */}
      {editingProduct && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20, backdropFilter:"blur(6px)" }}>
          <div style={{ background:"#0f0f0f", border:"1px solid #1f1f1f", borderRadius:20, width:"100%", maxWidth:480, overflow:"hidden", maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
            <div style={{ background:"#0a0a0a", padding:"18px 24px", borderBottom:"1px solid #1a1a1a" }}>
              <div style={{ fontWeight:700, fontSize:16 }}>{editingProduct.id ? `Editar producto #${editingProduct.id}` : "Nuevo producto"}</div>
              <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{editingProduct.id ? "Cambios se aplican en vivo en la tienda." : "Después de crear, podés subirle la foto desde el listado."}</div>
            </div>
            <div style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:14, overflowY:"auto" }}>
              <div>
                <label style={lbl}>Nombre *</label>
                <input value={productForm.name} onChange={e=>setProductForm(p=>({...p,name:e.target.value}))} placeholder="Ej: Bolsa Tote" style={inp}/>
              </div>
              <div>
                <label style={lbl}>Categoría *</label>
                <input list="catlist" value={productForm.cat} onChange={e=>setProductForm(p=>({...p,cat:e.target.value}))} placeholder="Ej: Bolsos" style={inp}/>
                <datalist id="catlist">
                  {[...new Set(products.map(p=>p.cat).filter(Boolean))].map(c=><option key={c} value={c}/>)}
                </datalist>
              </div>
              <div>
                <label style={lbl}>Descripción *</label>
                <textarea rows={3} value={productForm.desc} onChange={e=>setProductForm(p=>({...p,desc:e.target.value}))} placeholder="Descripción corta del producto" style={{...inp,resize:"none"}}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                <div>
                  <label style={lbl}>Stock</label>
                  <input type="number" min="0" value={productForm.stock} onChange={e=>setProductForm(p=>({...p,stock:e.target.value}))} style={inp}/>
                </div>
                <div>
                  <label style={lbl}>Color BG</label>
                  <input type="color" value={productForm.color} onChange={e=>setProductForm(p=>({...p,color:e.target.value}))} style={{...inp, padding:4, height:42, cursor:"pointer"}}/>
                </div>
                <div>
                  <label style={lbl}>Acento</label>
                  <input type="color" value={productForm.accent} onChange={e=>setProductForm(p=>({...p,accent:e.target.value}))} style={{...inp, padding:4, height:42, cursor:"pointer"}}/>
                </div>
              </div>
              {productFormErr && <p style={{ color:"#f87171", fontSize:12, margin:0 }}>{productFormErr}</p>}
            </div>
            <div style={{ padding:"16px 24px", borderTop:"1px solid #1a1a1a", display:"flex", gap:10 }}>
              <button onClick={closeProductForm} style={{ flex:1, padding:"12px", background:"transparent", border:"1px solid #2a2a2a", borderRadius:10, color:"#9ca3af", fontSize:14, cursor:"pointer" }}>Cancelar</button>
              <button onClick={saveProduct} disabled={productSaving} style={{ flex:1, padding:"12px", background:productSaving?"#374151":"linear-gradient(135deg,#1d4ed8,#1e40af)", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:600, cursor:productSaving?"wait":"pointer" }}>
                {productSaving ? "Guardando…" : (editingProduct.id ? "Guardar cambios" : "Crear producto")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
