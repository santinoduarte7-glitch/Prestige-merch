import React, { useState, useMemo, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ── FIREBASE CONFIG — reemplazá con tus credenciales ──────────
const firebaseConfig = {
  apiKey:            "AIzaSyAHUJYUN-HqRTXvW00HmoTQY48JMHDt6t0",
  authDomain:        "prestige-merch-2ad1a.firebaseapp.com",
  projectId:         "prestige-merch-2ad1a",
  storageBucket:     "prestige-merch-2ad1a.firebasestorage.app",
  messagingSenderId: "644078388510",
  appId:             "1:644078388510:web:3cbb556f4d38135c39350f",
};
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);
const storage     = getStorage(firebaseApp);

// ── CONFIGURACIÓN ──────────────────────────────────────────────
const ADMIN_EMAIL    = "merchandising@prestigeauto.com.ar";
const ADMIN_PASSWORD = "admin123";

const PRODUCTS = [
  { id:1,  name:"Bolsa Tote",            cat:"Bolsos",       desc:"Bolsa de tela negra con parche de cuero y logo Mercedes-Benz.",      color:"#1a1a1a", accent:"#b8860b" },
  { id:2,  name:"Mochila Táctica Negra", cat:"Mochilas",     desc:"Mochila táctica negra con sistema MOLLE y parche metálico.",          color:"#0d0d0d", accent:"#a0a0a0" },
  { id:3,  name:"Mochila Táctica Arena", cat:"Mochilas",     desc:"Mochila táctica color arena/coyote con múltiples compartimentos.",    color:"#7a6040", accent:"#c8a96e" },
  { id:4,  name:"Mochila AMG Petronas",  cat:"Mochilas",     desc:"Mochila Adidas × Mercedes-AMG Petronas F1 Team. Edición especial.",   color:"#0a0a0a", accent:"#00D2BE" },
  { id:5,  name:"Manta de Viaje",        cat:"Hogar",        desc:"Manta artesanal multicolor con flecos y logo bordado Mercedes-Benz.", color:"#2a1525", accent:"#e07070" },
  { id:6,  name:"Gorra Vito",            cat:"Gorras",       desc:"Gorra negra estructurada con logo Mercedes-Benz y detalle 'Vito'.",   color:"#0a0a0a", accent:"#ffffff" },
  { id:7,  name:"Gorra Trucker",         cat:"Gorras",       desc:"Gorra trucker negra con logo Mercedes-Benz en relieve al frente.",    color:"#111111", accent:"#e0e0e0" },
  { id:8,  name:"Remera Prestige Auto",  cat:"Indumentaria", desc:"Remera negra de algodón con estampado Prestige Auto.",                color:"#181818", accent:"#3b82f6" },
  { id:9,  name:"Botella Estrella",      cat:"Bebidas",      desc:"Botella de vidrio con funda de silicona negra y logo Mercedes-Benz.", color:"#1a1a1a", accent:"#d1d5db" },
  { id:10, name:"Vaso de Café Largo",    cat:"Bebidas",      desc:"Vaso térmico negro largo de acero inoxidable con logo grabado.",      color:"#141414", accent:"#9ca3af" },
  { id:11, name:"Vaso de Café Blanco",   cat:"Bebidas",      desc:"Vaso térmico de acero inoxidable blanco con logo Mercedes-Benz.",     color:"#d4d4d4", accent:"#111111" },
  { id:12, name:"Matera Mochila",        cat:"Mochilas",     desc:"Mochila premium negra con detalles en cuero sintético y logo.",       color:"#0f0f0f", accent:"#6b7280" },
  { id:13, name:"Set Glamping",          cat:"Lifestyle",    desc:"Set completo para glamping con branding Mercedes-Benz.",              color:"#888888", accent:"#b8860b" },
  { id:14, name:"Silla de Playa",        cat:"Lifestyle",    desc:"Silla plegable de aluminio con tela Mercedes-Benz y apoyacabezas.",   color:"#1a1a1a", accent:"#c0c0c0" },
];

const CATS       = ["Todos", ...new Set(PRODUCTS.map(p => p.cat))];
const STATUS_OPT = ["Pendiente", "En proceso", "Entregado"];
const ST = {
  "Pendiente":  { bg:"#2d1f00", text:"#fbbf24", dot:"#f59e0b", border:"#92400e" },
  "En proceso": { bg:"#0c1a2e", text:"#60a5fa", dot:"#3b82f6", border:"#1e40af" },
  "Entregado":  { bg:"#022c1a", text:"#34d399", dot:"#10b981", border:"#065f46" },
};

// ── EMAIL ──────────────────────────────────────────────────────
async function sendOrderEmails(order) {
  // Usá EmailJS o tu propio backend para enviar emails en producción
  // Por ahora loguea el pedido
  console.log("Nuevo pedido:", order);
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

const PrestigeLogo = ({ logoUrl }) => (
  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
    {logoUrl
      ? <img src={logoUrl} alt="Prestige Auto" style={{ height:38, objectFit:"contain" }}/>
      : <>
          <svg width={44} height={44} viewBox="0 0 44 44">
            <defs><linearGradient id="blu" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#1e90ff"/><stop offset="100%" stopColor="#0047ab"/></linearGradient></defs>
            <path d="M9 6 L9 38 L16 38 L16 27 C16 27 36 29 36 17.5 C36 7 18 6 9 6 Z M16 12 C16 12 29 11 29 17.5 C29 23 16 22 16 22 Z" fill="url(#blu)"/>
          </svg>
          <div>
            <div style={{ fontWeight:300, fontSize:17, letterSpacing:"0.04em", color:"#fff" }}>
              prestige <span style={{ fontWeight:700, color:"#3b82f6" }}>auto</span>
            </div>
            <div style={{ fontSize:9, letterSpacing:"0.25em", color:"#4b5563", textTransform:"uppercase", marginTop:2 }}>Mercedes-Benz Dealer</div>
          </div>
        </>
    }
    <div style={{ width:1, height:32, background:"#2a2a2a", margin:"0 6px" }}/>
    <MBStar size={22} color="#777"/>
  </div>
);

// ── APP ────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]             = useState("store");
  const [cat, setCat]               = useState("Todos");
  const [orders, setOrders]         = useState([]);
  const [productImages, setProductImages] = useState({});
  const [logoUrl, setLogoUrl]       = useState(null);
  const [selected, setSelected]     = useState(null);
  const [form, setForm]             = useState({ name:"", area:"", email:"", reason:"" });
  const [formErr, setFormErr]       = useState("");
  const [sending, setSending]       = useState(false);
  const [success, setSuccess]       = useState("");
  const [adminPass, setAdminPass]   = useState("");
  const [adminErr, setAdminErr]     = useState("");
  const [search, setSearch]         = useState("");
  const [statusF, setStatusF]       = useState("Todos");
  const [expandedId, setExpandedId] = useState(null);
  const [adminTab, setAdminTab]     = useState("orders");
  const [uploading, setUploading]   = useState(false);
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

  // Cargar imágenes de productos desde Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "images"), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setLogoUrl(data.logo || null);
        setProductImages(data.products || {});
      }
    });
    return () => unsub();
  }, []);

  const filteredProd = cat === "Todos" ? PRODUCTS : PRODUCTS.filter(p => p.cat === cat);

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

  const openOrder = p => { setSelected(p); setForm({ name:"", area:"", email:"", reason:"" }); setFormErr(""); };

  const submitOrder = async () => {
    if (!form.name.trim() || !form.area.trim() || !form.email.trim() || !form.reason.trim()) { setFormErr("Completá todos los campos."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setFormErr("Email inválido."); return; }
    const order = {
      ...form,
      product: selected.name,
      status: "Pendiente",
      date: new Date().toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric" }),
      timestamp: Date.now(),
    };
    setSending(true);
    setSelected(null);
    try {
      await addDoc(collection(db, "orders"), order);
      await sendOrderEmails(order);
      setSuccess(`✅ Pedido de "${order.product}" enviado correctamente.`);
    } catch (e) {
      setSuccess("⚠️ Error al guardar el pedido. Intentá de nuevo.");
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
      const storageRef = ref(storage, `merch/${key}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const configRef = doc(db, "config", "images");
      const { setDoc, getDoc } = await import("firebase/firestore");
      const snap = await getDoc(configRef);
      const existing = snap.exists() ? snap.data() : { logo: null, products: {} };
      if (key === "logo") existing.logo = url;
      else existing.products[key] = url;
      await setDoc(configRef, existing);
    } catch (e) { console.error(e); }
    setUploading(false);
  };

  const handleAdminLogin = () => {
    if (adminPass === ADMIN_PASSWORD) { setView("admin"); setAdminErr(""); setAdminPass(""); }
    else setAdminErr("Contraseña incorrecta.");
  };

  const s   = { fontFamily:"'Inter','Helvetica Neue',sans-serif", minHeight:"100vh", background:"#080808", color:"#f3f4f6" };
  const inp = { width:"100%", boxSizing:"border-box", padding:"11px 14px", background:"#141414", border:"1px solid #2a2a2a", borderRadius:10, color:"#f3f4f6", fontSize:14, outline:"none", fontFamily:"inherit" };
  const lbl = { display:"block", fontSize:10, fontWeight:600, color:"#6b7280", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 };

  return (
    <div style={s}>
      {/* HEADER */}
      <header style={{ background:"#0d0d0d", borderBottom:"1px solid #1a1a1a", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:64, position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 20px rgba(0,0,0,0.7)" }}>
        <PrestigeLogo logoUrl={logoUrl}/>
        <div style={{ display:"flex", gap:8 }}>
          {[{label:"Tienda",active:view==="store",fn:()=>setView("store")},{label:"Admin",active:view==="admin",fn:()=>view==="admin"?setView("store"):setView("adminLogin")}].map(b=>(
            <button key={b.label} onClick={b.fn} style={{ padding:"7px 18px", borderRadius:8, fontSize:13, fontWeight:500, border:"1px solid", cursor:"pointer",
              background:b.active?"linear-gradient(135deg,#1d4ed8,#1e40af)":"transparent",
              color:b.active?"#fff":"#9ca3af", borderColor:b.active?"#1d4ed8":"#2a2a2a" }}>
              {b.label}
            </button>
          ))}
        </div>
      </header>

      {/* ADMIN LOGIN */}
      {view==="adminLogin" && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"82vh", padding:20 }}>
          <div style={{ background:"#0f0f0f", border:"1px solid #1f1f1f", borderRadius:20, padding:"40px 36px", width:"100%", maxWidth:380 }}>
            <div style={{ textAlign:"center", marginBottom:28 }}>
              <MBStar size={42} color="#3b82f6"/>
              <h2 style={{ margin:"14px 0 6px", fontSize:20, fontWeight:700 }}>Panel Administrativo</h2>
              <p style={{ margin:0, color:"#6b7280", fontSize:13 }}>Ingresá tu contraseña para continuar</p>
            </div>
            <label style={lbl}>Contraseña</label>
            <input type="password" value={adminPass} onChange={e=>setAdminPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} style={{...inp,marginBottom:8}} placeholder="••••••••"/>
            {adminErr && <p style={{ color:"#f87171", fontSize:12, margin:"0 0 10px" }}>{adminErr}</p>}
            <button onClick={handleAdminLogin} style={{ width:"100%", padding:"12px", marginTop:8, background:"linear-gradient(135deg,#1d4ed8,#1e40af)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>Ingresar</button>
            <p style={{ textAlign:"center", color:"#2a2a2a", fontSize:11, marginTop:18 }}>Demo: admin123</p>
          </div>
        </div>
      )}

      {/* STORE */}
      {view==="store" && (
        <main style={{ maxWidth:1140, margin:"0 auto", padding:"32px 20px" }}>
          {success && <div style={{ marginBottom:24, background:"#052e16", border:"1px solid #166534", borderRadius:12, padding:"14px 20px", color:"#4ade80", fontSize:14 }}>{success}</div>}
          <div style={{ marginBottom:28, paddingBottom:24, borderBottom:"1px solid #1a1a1a" }}>
            <h1 style={{ margin:"0 0 6px", fontSize:26, fontWeight:700 }}>Catálogo de Merchandising</h1>
            <p style={{ margin:0, color:"#6b7280", fontSize:14 }}>Todos los artículos están disponibles sin costo para el equipo.</p>
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:28, flexWrap:"wrap" }}>
            {CATS.map(c=>(
              <button key={c} onClick={()=>setCat(c)} style={{ padding:"7px 16px", borderRadius:20, fontSize:12, fontWeight:500, cursor:"pointer", border:"1px solid",
                background:cat===c?"#1d4ed8":"transparent", color:cat===c?"#fff":"#9ca3af", borderColor:cat===c?"#1d4ed8":"#2a2a2a" }}>{c}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:18 }}>
            {filteredProd.map(p => {
              const img = productImages[p.id];
              return (
                <div key={p.id} style={{ background:"#0f0f0f", border:"1px solid #1a1a1a", borderRadius:16, overflow:"hidden", display:"flex", flexDirection:"column", transition:"transform .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"}
                  onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
                  <div style={{ height:200, background:img?"#000":`radial-gradient(ellipse at 40% 40%, ${p.color} 0%, #050505 100%)`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
                    {img ? <img src={img} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : <div style={{ opacity:.15 }}><MBStar size={70} color={p.accent}/></div>}
                    <div style={{ position:"absolute", top:10, right:10, background:"#00000099", borderRadius:20, padding:"3px 10px", fontSize:10, color:"#9ca3af", border:"1px solid #2a2a2a" }}>{p.cat}</div>
                  </div>
                  <div style={{ padding:16, display:"flex", flexDirection:"column", flex:1 }}>
                    <h3 style={{ margin:"0 0 6px", fontSize:14, fontWeight:600 }}>{p.name}</h3>
                    <p style={{ margin:"0 0 14px", fontSize:12, color:"#6b7280", lineHeight:1.5, flex:1 }}>{p.desc}</p>
                    <button onClick={()=>openOrder(p)} style={{ width:"100%", padding:"10px", background:"linear-gradient(135deg,#1d4ed8,#1e40af)", color:"#fff", border:"none", borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>Solicitar</button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ADMIN */}
      {view==="admin" && (
        <main style={{ maxWidth:1000, margin:"0 auto", padding:"32px 20px" }}>
          <div style={{ marginBottom:24, paddingBottom:20, borderBottom:"1px solid #1a1a1a", display:"flex", alignItems:"flex-end", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <h1 style={{ margin:"0 0 4px", fontSize:22, fontWeight:700 }}>Panel de Administración</h1>
              <p style={{ margin:0, color:"#6b7280", fontSize:13 }}>{orders.length} pedido{orders.length!==1?"s":""} registrado{orders.length!==1?"s":""}</p>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {[{id:"orders",label:"📋 Pedidos"},{id:"images",label:"🖼️ Imágenes"}].map(t=>(
                <button key={t.id} onClick={()=>setAdminTab(t.id)} style={{ padding:"8px 16px", borderRadius:8, fontSize:13, fontWeight:500, border:"1px solid", cursor:"pointer",
                  background:adminTab===t.id?"linear-gradient(135deg,#1d4ed8,#1e40af)":"transparent",
                  color:adminTab===t.id?"#fff":"#9ca3af", borderColor:adminTab===t.id?"#1d4ed8":"#2a2a2a" }}>{t.label}</button>
              ))}
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
                          <div style={{ fontSize:13, color:"#3b82f6", fontWeight:500 }}>{o.product}</div>
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
                          {[{l:"Nombre",v:o.name},{l:"Área",v:o.area},{l:"Email",v:o.email},{l:"Producto",v:o.product},{l:"Fecha",v:o.date},{l:"Estado",v:o.status},{l:"Motivo",v:o.reason,full:true}].map(f=>(
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

          {adminTab==="images" && (
            <div>
              <p style={{ color:"#6b7280", fontSize:13, marginBottom:24 }}>Las imágenes se guardan en Firebase Storage y se ven para todos los usuarios.</p>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#6b7280", textTransform:"uppercase", marginBottom:10 }}>Logo Prestige Auto</div>
                <div style={{ display:"flex", alignItems:"center", gap:16, background:"#0f0f0f", border:"1px solid #1a1a1a", borderRadius:14, padding:16 }}>
                  <div style={{ width:80, height:60, borderRadius:10, background:"#141414", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
                    {logoUrl ? <img src={logoUrl} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain"}}/> : <span style={{color:"#333",fontSize:22}}>🏢</span>}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>Logo del Header</div>
                    <div style={{ fontSize:12, color:"#6b7280" }}>Se muestra en la barra superior.</div>
                  </div>
                  <input ref={el=>fileRefs.current["logo"]=el} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleImageUpload("logo",e.target.files[0])}/>
                  <button onClick={()=>fileRefs.current["logo"]?.click()} disabled={uploading}
                    style={{ padding:"8px 16px", background:logoUrl?"#141414":"linear-gradient(135deg,#1d4ed8,#1e40af)", border:"1px solid", borderColor:logoUrl?"#2a2a2a":"#1d4ed8", borderRadius:10, color:"#fff", fontSize:13, cursor:"pointer" }}>
                    {uploading?"Subiendo…":logoUrl?"Cambiar":"Subir logo"}
                  </button>
                </div>
              </div>
              <div style={{ fontSize:11, fontWeight:600, color:"#6b7280", textTransform:"uppercase", marginBottom:10 }}>Productos</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {PRODUCTS.map(p => {
                  const img = productImages[p.id];
                  return (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:16, background:"#0f0f0f", border:"1px solid #1a1a1a", borderRadius:14, padding:16 }}>
                      <div style={{ width:72, height:72, borderRadius:10, background:img?"#000":"#141414", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                        {img ? <img src={img} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <MBStar size={28} color={p.accent}/>}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>{p.name}</div>
                        <div style={{ fontSize:12, color:"#6b7280" }}>{p.cat} · {img ? <span style={{color:"#34d399"}}>✓ Imagen cargada</span> : <span style={{color:"#f59e0b"}}>Sin imagen</span>}</div>
                      </div>
                      <input ref={el=>fileRefs.current[p.id]=el} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleImageUpload(p.id,e.target.files[0])}/>
                      <button onClick={()=>fileRefs.current[p.id]?.click()} disabled={uploading}
                        style={{ padding:"8px 16px", background:img?"#141414":"linear-gradient(135deg,#1d4ed8,#1e40af)", border:"1px solid", borderColor:img?"#2a2a2a":"#1d4ed8", borderRadius:10, color:"#fff", fontSize:13, cursor:"pointer" }}>
                        {uploading?"Subiendo…":img?"Cambiar":"Subir foto"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      )}

      {/* MODAL */}
      {selected && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20, backdropFilter:"blur(6px)" }}>
          <div style={{ background:"#0f0f0f", border:"1px solid #1f1f1f", borderRadius:20, width:"100%", maxWidth:440, overflow:"hidden" }}>
            <div style={{ background:"#0a0a0a", padding:"20px 24px", borderBottom:"1px solid #1a1a1a", display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:52, height:52, borderRadius:12, background:"#141414", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {productImages[selected.id] ? <img src={productImages[selected.id]} alt={selected.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <MBStar size={22} color="#3b82f6"/>}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:15 }}>Solicitar — {selected.name}</div>
                <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{selected.desc}</div>
              </div>
            </div>
            <div style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:14 }}>
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
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button onClick={()=>setSelected(null)} style={{ flex:1, padding:"12px", background:"transparent", border:"1px solid #2a2a2a", borderRadius:10, color:"#9ca3af", fontSize:14, cursor:"pointer" }}>Cancelar</button>
                <button onClick={submitOrder} disabled={sending} style={{ flex:1, padding:"12px", background:sending?"#374151":"linear-gradient(135deg,#1d4ed8,#1e40af)", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:600, cursor:sending?"wait":"pointer" }}>
                  {sending?"Guardando…":"Enviar pedido"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
