"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Upload, X, Loader2, Download, Trash2, ArrowLeftRight,
  Home, UtensilsCrossed, Bath, BedDouble, Monitor, DoorOpen,
  Flower2, Armchair, Sparkles, Info, Box, Plus, ExternalLink,
  RotateCcw, Compass, Crown, Ship, Paintbrush, Grid3x3,
  Film, ChevronRight, ChevronLeft, Clock, Eye, Settings2, Wand2, Layers,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";

// ============================================
// TYPES & DATA
// ============================================
type Tool = "redesign" | "inpaint" | "grid" | "video";
type Room = { id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };
type Style = { id: string; label: string };
type Result = { id: string; orig: string; result: string; room: string; style: string; ts: number; tool: Tool };

const ROOMS: Room[] = [
  { id: "salon", label: "Salon", icon: Home },
  { id: "yatak", label: "Yatak Odası", icon: BedDouble },
  { id: "mutfak", label: "Mutfak", icon: UtensilsCrossed },
  { id: "banyo", label: "Banyo", icon: Bath },
  { id: "calisma", label: "Çalışma Odası", icon: Monitor },
  { id: "hol", label: "Hol", icon: DoorOpen },
  { id: "yemek", label: "Yemek Odası", icon: Armchair },
  { id: "bahce", label: "Bahçe / Teras", icon: Flower2 },
  { id: "yat", label: "Yat", icon: Ship },
];

const STYLES: Style[] = [
  { id: "sessiz-luks", label: "Sessiz Lüks" },
  { id: "italyan", label: "İtalyan Mimari" },
  { id: "luxury-konsept", label: "Luxury Konsept" },
  { id: "modern", label: "Modern Minimalist" },
  { id: "klasik-luks", label: "Klasik Lüks" },
  { id: "art-deco", label: "Art Deco" },
  { id: "japandi", label: "Japandi" },
  { id: "fransiz", label: "Fransız Elegance" },
  { id: "hollywood", label: "Hollywood Glam" },
  { id: "iskand", label: "İskandinav" },
  { id: "contemporary", label: "Contemporary" },
  { id: "neo-klasik", label: "Neo Klasik" },
  { id: "tropik-luks", label: "Tropik Lüks" },
  { id: "brutalist", label: "Brutalist" },
  { id: "wabi-sabi", label: "Wabi-Sabi" },
];

const TOOLS: { id: Tool; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; desc: string }[] = [
  { id: "redesign", label: "AI Tasarım", icon: Wand2, desc: "Odayı yeniden tasarla" },
  { id: "inpaint", label: "Bölgesel Düzenle", icon: Paintbrush, desc: "Çizerek alan düzenle" },
  { id: "grid", label: "Çoklu Açı", icon: Grid3x3, desc: "Farklı açılar üret" },
  { id: "video", label: "Video Oluştur", icon: Film, desc: "Görselden video" },
];

const STAGES = [
  { p: 5, m: "Oda analiz ediliyor..." }, { p: 15, m: "Yapı tespit ediliyor..." },
  { p: 25, m: "Stil uygulanıyor..." }, { p: 40, m: "Mobilyalar yerleştiriliyor..." },
  { p: 55, m: "Aydınlatma ayarlanıyor..." }, { p: 70, m: "Detaylar ekleniyor..." },
  { p: 85, m: "Render yapılıyor..." }, { p: 95, m: "Tamamlanıyor..." },
];

// ============================================
// COMPONENT
// ============================================
export default function LuxoraStudio() {
  // — State
  const [tool, setTool] = useState<Tool>("redesign");
  const [sideOpen, setSideOpen] = useState(false);
  const [room, setRoom] = useState("salon");
  const [style, setStyle] = useState("sessiz-luks");
  const [img, setImg] = useState<string | null>(null);
  const [res, setRes] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [stat, setStat] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [hist, setHist] = useState<Result[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pos, setPos] = useState(50);
  const [sliding, setSliding] = useState(false);
  const [drag, setDrag] = useState(false);
  const [walls, setWalls] = useState(false);
  const [floor, setFloor] = useState(false);
  const [light, setLight] = useState(false);
  const [keep, setKeep] = useState(true);
  const [ok, setOk] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cmpRef = useRef<HTMLDivElement>(null);
  const sideTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setOk(true);
    try {
      const saved = localStorage.getItem('luxora_history');
      if (saved) setHist(JSON.parse(saved));
    } catch {}
  }, []);

  // Lightbox ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    if (lightbox) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [lightbox]);

  // File
  const onFile = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = () => { setImg(r.result as string); setRes(null); setErr(null); };
    r.readAsDataURL(f);
  };

  // Slider
  const moveS = useCallback((cx: number) => {
    if (!cmpRef.current || !sliding) return;
    const r = cmpRef.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((cx - r.left) / r.width) * 100)));
  }, [sliding]);

  useEffect(() => {
    const mm = (e: MouseEvent) => moveS(e.clientX);
    const tm = (e: TouchEvent) => moveS(e.touches[0].clientX);
    const up = () => setSliding(false);
    if (sliding) { window.addEventListener("mousemove", mm); window.addEventListener("touchmove", tm); window.addEventListener("mouseup", up); window.addEventListener("touchend", up); }
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("touchmove", tm); window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up); };
  }, [sliding, moveS]);

  // Generate
  const gen = async () => {
    if (!img) return;
    setBusy(true); setProg(0); setStat("Başlatılıyor..."); setErr(null); setRes(null);
    let iv: NodeJS.Timeout | null = null; let done = false;
    iv = setInterval(() => { if (done) { if (iv) clearInterval(iv); return; } setProg(p => { if (p < 95) { const n = p + 0.8; setStat(STAGES.findLast(s => n >= s.p)?.m || ""); return n; } return p; }); }, 500);
    try {
      const r = await fetch("/api/redesign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: img, roomType: room, designStyle: style, options: { changeWalls: walls, changeFloor: floor, changeLighting: light, keepLayout: keep }, additionalPrompt: prompt }) });
      if (!r.ok) throw new Error((await r.json()).error || "Hata");
      const d = await r.json();
      if (d.success && d.resultImage) {
        done = true; if (iv) clearInterval(iv); setProg(100); setStat("Tamamlandı!");
        await new Promise(r => setTimeout(r, 400));
        setRes(d.resultImage); setPos(50);
        const newItem: Result = { id: Date.now() + '', orig: img, result: d.resultImage, room: ROOMS.find(x => x.id === room)?.label || room, style: STYLES.find(x => x.id === style)?.label || style, ts: Date.now(), tool };
        setHist(p => {
          const updated = [newItem, ...p].slice(0, 50);
          try { localStorage.setItem('luxora_history', JSON.stringify(updated)); } catch {}
          return updated;
        });
      } else throw new Error("Üretilemedi");
    } catch (e) { done = true; if (iv) clearInterval(iv); setProg(0); setErr(e instanceof Error ? e.message : "Hata"); }
    finally { setBusy(false); }
  };

  // Download
  const dl = async () => {
    if (!res) return;
    if (res.startsWith("data:")) { const a = document.createElement("a"); a.href = res; a.download = `luxora_${Date.now()}.png`; a.click(); return; }
    try { const r = await fetch(`/api/download?url=${encodeURIComponent(res)}`); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `luxora_${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(res, "_blank"); }
  };

  if (!ok) return null;

  // ============================================
  // RENDER
  // ============================================
  return (
    <div style={{ display: 'grid', gridTemplateRows: '56px 1fr', gridTemplateColumns: `${sideOpen ? 260 : 60}px 1fr 260px`, height: '100vh', overflow: 'hidden', transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>

      {/* ======================================== */}
      {/* HEADER                                    */}
      {/* ======================================== */}
      <header style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#111114', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #e9c86e, #b3862a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={15} color="#000" />
          </div>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 500, letterSpacing: '0.04em', color: '#e8e0d4' }}>
            Luxora <span style={{ color: '#d4a537' }}>AI</span>
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: '#d4a537', background: 'rgba(212,165,55,0.1)', padding: '3px 8px', borderRadius: 6, marginLeft: 4 }}>STUDIO</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#666' }}>v2.0</span>
        </div>
      </header>

      {/* ======================================== */}
      {/* LEFT SIDEBAR                              */}
      {/* ======================================== */}
      <aside
        onMouseEnter={() => { if (sideTimer.current) { clearTimeout(sideTimer.current); sideTimer.current = null; } setSideOpen(true); }}
        onMouseLeave={() => { sideTimer.current = setTimeout(() => setSideOpen(false), 400); }}
        style={{
          overflowY: 'auto', overflowX: 'hidden',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: '#111114', padding: '12px 0',
          display: 'flex', flexDirection: 'column' as const,
        }}
      >
        {/* Tools */}
        {TOOLS.map(t => {
          const I = t.icon;
          const isActive = tool === t.id;
          return (
            <div
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              style={{
                display: 'flex', alignItems: 'center',
                height: 44,
                padding: '0 18px',
                gap: 12,
                cursor: 'pointer',
                color: isActive ? '#d4a537' : '#666',
                background: isActive ? 'rgba(212,165,55,0.06)' : 'transparent',
                borderLeft: isActive ? '2px solid #d4a537' : '2px solid transparent',
                transition: 'color 0.15s, background 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseOver={e => { if (!isActive) { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; } }}
              onMouseOut={e => { if (!isActive) { e.currentTarget.style.color = '#666'; e.currentTarget.style.background = 'transparent'; } }}
            >
              <I size={18} style={{ flexShrink: 0 }} />
              <span style={{
                opacity: sideOpen ? 1 : 0,
                transition: 'opacity 0.2s ease',
                fontSize: 13, fontWeight: 500,
                overflow: 'hidden',
              }}>
                {t.label}
              </span>
            </div>
          );
        })}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 14px' }} />

        {/* History Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 18px', marginBottom: 8,
          opacity: sideOpen ? 1 : 0,
          transition: 'opacity 0.2s ease',
          whiteSpace: 'nowrap',
        }}>
          <Clock size={11} color="#555" />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#555' }}>
            Geçmiş {hist.length > 0 && `(${hist.length})`}
          </span>
        </div>

        {/* History icon when collapsed */}
        {!sideOpen && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0', color: '#444' }}>
            <Clock size={16} />
          </div>
        )}

        {/* History items */}
        <div style={{
          opacity: sideOpen ? 1 : 0,
          transition: 'opacity 0.2s ease',
          pointerEvents: sideOpen ? 'auto' : 'none',
        }}>
          {hist.length === 0 && (
            <div style={{ padding: '0 18px', fontSize: 11, color: '#333' }}>
              Henüz tasarım yok
            </div>
          )}
          {hist.map(h => (
            <div
              key={h.id}
              onClick={() => { setImg(h.orig); setRes(h.result); setPos(50); }}
              style={{
                display: 'flex', gap: 10, padding: '8px 18px',
                cursor: 'pointer', transition: 'background 0.1s',
                borderLeft: '2px solid transparent',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ width: 44, height: 32, borderRadius: 6, overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(255,255,255,0.06)' }}>
                <img src={h.result} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.room} · {h.style}</div>
                <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>{new Date(h.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ======================================== */}
      {/* MAIN CANVAS                               */}
      {/* ======================================== */}
      <main style={{ overflowY: 'auto', background: '#0a0a0c', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>

        {/* === NO IMAGE: Upload Area === */}
        {!img && !res && (
          <div
            className={`canvas-upload ${drag ? 'dragging' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
          >
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={22} color="#666" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#ccc' }}>Oda fotoğrafı yükleyin</p>
              <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}>Sürükleyin veya tıklayarak seçin</p>
            </div>
          </div>
        )}

        {/* === HAS IMAGE: Show it === */}
        {img && !res && (
          <div className="canvas-image fade-in" style={{ position: 'relative' }}>
            <img src={img} alt="" style={{ maxHeight: '70vh', objectFit: 'contain' }} />

            {/* Remove button */}
            {!busy && (
              <button
                onClick={() => { setImg(null); setRes(null); }}
                style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 8, background: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', transition: 'all 0.15s', zIndex: 10 }}
              >
                <X size={14} color="#fff" />
              </button>
            )}

            {/* Progress overlay */}
            {busy && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 20 }}>
                <div style={{ position: 'relative', width: 72, height: 72 }}>
                  <svg style={{ width: 72, height: 72, transform: 'rotate(-90deg)' }}>
                    <circle cx="36" cy="36" r="30" stroke="var(--bg-3)" strokeWidth="3" fill="none" />
                    <circle cx="36" cy="36" r="30" stroke="#d4a537" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray={188.5} strokeDashoffset={188.5 - (188.5 * prog) / 100} style={{ transition: 'all 0.3s' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{Math.round(prog)}%</span>
                  </div>
                </div>
                <p style={{ color: '#d4a537', fontSize: 12, fontWeight: 500 }}>{stat}</p>
              </div>
            )}
          </div>
        )}

        {/* === RESULT: Before/After Comparison === */}
        {res && img && (
          <div className="fade-in" style={{ width: '100%', maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#ccc' }}>Sonuç</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setLightbox(img)}
                  title="Orijinali görüntüle"
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, backgroundColor: 'var(--bg-3)', border: '1px solid var(--bdr)', color: '#888', fontSize: 11, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}
                >
                  <Eye size={12} />Öncesi
                </button>
                <button
                  onClick={() => setLightbox(res)}
                  title="Sonucu görüntüle"
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, backgroundColor: 'rgba(212,165,55,0.08)', border: '1px solid rgba(212,165,55,0.2)', color: '#d4a537', fontSize: 11, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}
                >
                  <Eye size={12} />Sonrası
                </button>
                <button onClick={dl} style={{ height: 32, padding: '0 14px', borderRadius: 8, backgroundColor: 'var(--bg-3)', border: '1px solid var(--bdr)', color: '#aaa', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
                  <Download size={12} />İndir
                </button>
                <button onClick={() => setRes(null)} style={{ height: 32, width: 32, borderRadius: 8, backgroundColor: 'var(--bg-3)', border: '1px solid var(--bdr)', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            <div
              ref={cmpRef} className="cmp"
              onMouseDown={e => { setSliding(true); moveS(e.clientX); }}
              onTouchStart={e => { setSliding(true); moveS(e.touches[0].clientX); }}
              onDoubleClick={() => setLightbox(res)}
              title="Çift tıklayarak büyüt"
            >
              <img src={res} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${pos}%` }}>
                <img src={img} alt="" style={{ position: 'absolute', inset: 0, height: '100%', objectFit: 'cover', width: `${100 / (pos / 100)}%`, maxWidth: 'none' }} />
              </div>
              <div className="cmp-label" style={{ left: 10, color: 'rgba(255,255,255,0.85)' }}>Öncesi</div>
              <div className="cmp-label" style={{ right: 10, color: '#d4a537', background: 'rgba(212,165,55,0.15)' }}>Sonrası</div>
              <div className="cmp-line" style={{ left: `${pos}%` }}>
                <div className="cmp-handle"><ArrowLeftRight size={14} color="#000" /></div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#555' }}>
                <span>{ROOMS.find(r => r.id === room)?.label}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{STYLES.find(s => s.id === style)?.label}</span>
              </div>
              <span style={{ fontSize: 10, color: '#444' }}>Çift tıkla: tam ekran</span>
            </div>
          </div>
        )}

        {/* Error */}
        {err && (
          <div className="fade-up" style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12, padding: '10px 16px', maxWidth: 720, margin: '0 auto' }}>
            <Info size={14} color="#ef4444" />
            <span style={{ fontSize: 12, color: 'rgba(239,68,68,0.8)', flex: 1 }}>{err}</span>
            <button onClick={() => setErr(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.5)' }}><X size={12} /></button>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => e.target.files && onFile(e.target.files[0])} />
      </main>

      {/* ======================================== */}
      {/* RIGHT PANEL                               */}
      {/* ======================================== */}
      <aside style={{ overflowY: 'auto', borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#111114', padding: '20px 16px' }}>

        {/* === REDESIGN TOOL === */}
        {tool === "redesign" && (
          <div className="fade-in">
            {/* Room Type */}
            <div className="panel-section">
              <div className="panel-label">Oda Türü</div>
              <select
                value={room}
                onChange={e => setRoom(e.target.value)}
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  backgroundColor: '#18181c', color: '#fff',
                  fontSize: 13, borderRadius: 10,
                  border: room !== 'salon' ? '1px solid rgba(212,165,55,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  outline: 'none', cursor: 'pointer',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                }}
              >
                {ROOMS.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Design Style */}
            <div className="panel-section">
              <div className="panel-label">Tasarım Stili</div>
              <select
                value={style}
                onChange={e => setStyle(e.target.value)}
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  backgroundColor: '#18181c', color: '#fff',
                  fontSize: 13, borderRadius: 10,
                  border: style !== 'sessiz-luks' ? '1px solid rgba(212,165,55,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  outline: 'none', cursor: 'pointer',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                }}
              >
                {STYLES.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Options */}
            <div className="panel-section">
              <div className="panel-label">Ayarlar</div>
              {[
                { l: "Duvar değiştir", v: walls, s: setWalls },
                { l: "Zemin değiştir", v: floor, s: setFloor },
                { l: "Aydınlatma değiştir", v: light, s: setLight },
                { l: "Oda düzenini koru", v: keep, s: setKeep },
              ].map(o => (
                <div key={o.l} className="toggle-row" onClick={() => o.s(!o.v)}>
                  <span className="label">{o.l}</span>
                  <div className="toggle-track" style={{ background: o.v ? '#d4a537' : '#222228' }}>
                    <div className="toggle-thumb" style={{ left: o.v ? 18 : 2 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Directive */}
            <div className="panel-section">
              <div className="panel-label">Ek Direktif <span style={{ textTransform: 'none', letterSpacing: 'normal', opacity: 0.5, fontWeight: 400 }}>(opsiyonel)</span></div>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value.slice(0, 500))}
                placeholder="Örn: Sağ duvardaki üniteyi kaldır, yerine şömine koy..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px',
                  backgroundColor: 'var(--bg-2)', color: '#fff',
                  fontSize: 12, lineHeight: 1.5, borderRadius: 10,
                  border: '1px solid var(--bdr)', outline: 'none',
                  resize: 'none', transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(212,165,55,0.2)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
              />
            </div>

            {/* Generate */}
            <button
              onClick={gen}
              disabled={!img || busy}
              className={`btn-generate ${!img || busy ? 'disabled' : 'ready'}`}
            >
              {busy ? <><Loader2 size={16} className="animate-spin" />Tasarlanıyor...</> : <><Wand2 size={16} />Tasarımı Başlat</>}
            </button>
          </div>
        )}

        {/* === INPAINT TOOL (placeholder) === */}
        {tool === "inpaint" && (
          <div className="fade-in">
            <div className="panel-section">
              <div className="panel-label">Bölgesel Düzenleme</div>
              <div style={{ padding: 20, textAlign: 'center', color: '#444', fontSize: 12 }}>
                <Paintbrush size={28} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                <p>Görsel üzerinde düzenlemek istediğiniz alanı fırça ile seçin.</p>
                <p style={{ marginTop: 8, fontSize: 11, color: '#333' }}>Yakında aktif olacak</p>
              </div>
            </div>
          </div>
        )}

        {/* === GRID TOOL (placeholder) === */}
        {tool === "grid" && (
          <div className="fade-in">
            <div className="panel-section">
              <div className="panel-label">Çoklu Açı Üretme</div>
              <div style={{ padding: 20, textAlign: 'center', color: '#444', fontSize: 12 }}>
                <Grid3x3 size={28} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                <p>Oda görselinden 9 farklı kamera açısı üretin.</p>
                <p style={{ marginTop: 8, fontSize: 11, color: '#333' }}>Yakında aktif olacak</p>
              </div>
            </div>
          </div>
        )}

        {/* === VIDEO TOOL (placeholder) === */}
        {tool === "video" && (
          <div className="fade-in">
            <div className="panel-section">
              <div className="panel-label">Video Oluşturma</div>
              <div style={{ padding: 20, textAlign: 'center', color: '#444', fontSize: 12 }}>
                <Film size={28} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                <p>Tasarım görsellerinizden walkthrough video oluşturun.</p>
                <p style={{ marginTop: 8, fontSize: 11, color: '#333' }}>Yakında aktif olacak</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ======================================== */}
      {/* LIGHTBOX MODAL                            */}
      {/* ======================================== */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, cursor: 'zoom-out' }}
        >
          <img src={lightbox} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', cursor: 'default' }} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
            <X size={18} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); const a = document.createElement('a'); a.href = lightbox; a.download = `luxora_preview.png`; a.click(); }}
            style={{ position: 'absolute', bottom: 20, right: 20, height: 40, padding: '0 16px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(10px)' }}
          >
            <Download size={14} />İndir
          </button>
        </div>
      )}
    </div>
  );
}
