"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Upload, X, Loader2, Download, Trash2, ArrowLeftRight,
  Home, UtensilsCrossed, Bath, BedDouble, Monitor, DoorOpen,
  Flower2, Armchair, Sparkles, Info, Box, Plus, ExternalLink,
  RotateCcw, Compass, Crown, Ship,
} from "lucide-react";

// ============================================
// TYPES & DATA
// ============================================
type Room = { id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };
type Style = { id: string; label: string };
type Result = { id: string; orig: string; result: string; room: string; style: string; ts: number };
type WImg = { id: string; url: string; az: number };
type WRes = { worldUrl: string; worldId: string };

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

const STAGES = [
  { p: 5, m: "Oda analiz ediliyor..." }, { p: 15, m: "Yapı tespit ediliyor..." },
  { p: 25, m: "Stil uygulanıyor..." }, { p: 40, m: "Mobilyalar yerleştiriliyor..." },
  { p: 55, m: "Aydınlatma ayarlanıyor..." }, { p: 70, m: "Detaylar ekleniyor..." },
  { p: 85, m: "Render yapılıyor..." }, { p: 95, m: "Tamamlanıyor..." },
];

// ============================================
// COMPONENT
// ============================================
export default function LuxoraAI() {
  const fileRef = useRef<HTMLInputElement>(null);
  const cmpRef = useRef<HTMLDivElement>(null);
  const wFileRef = useRef<HTMLInputElement>(null);

  const [ok, setOk] = useState(false);
  const [tab, setTab] = useState<"design" | "3d">("design");

  // Design
  const [room, setRoom] = useState("salon");
  const [style, setStyle] = useState("modern");
  const [img, setImg] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [drag, setDrag] = useState(false);
  const [walls, setWalls] = useState(false);
  const [floor, setFloor] = useState(false);
  const [light, setLight] = useState(false);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [stat, setStat] = useState("");
  const [res, setRes] = useState<string | null>(null);
  const [hist, setHist] = useState<Result[]>([]);
  const [pos, setPos] = useState(50);
  const [sliding, setSliding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // 3D
  const [wImgs, setWImgs] = useState<WImg[]>([]);
  const [wBusy, setWBusy] = useState(false);
  const [wStat, setWStat] = useState("");
  const [wRes, setWRes] = useState<WRes | null>(null);
  const [wPrm, setWPrm] = useState("");

  useEffect(() => setOk(true), []);

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
        setHist(p => [{ id: Date.now()+"", orig: img, result: d.resultImage, room: ROOMS.find(x => x.id === room)?.label || room, style: STYLES.find(x => x.id === style)?.label || style, ts: Date.now() }, ...p]);
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

  // 3D
  const addWI = (f: File) => { if (!f.type.startsWith("image/")) return; const r = new FileReader(); r.onload = () => setWImgs(p => { const u = [...p, { id: Date.now()+""+Math.random(), url: r.result as string, az: 0 }]; return u.map((m, i) => ({ ...m, az: Math.round(360 / u.length * i) })); }); r.readAsDataURL(f); };
  const rmWI = (id: string) => setWImgs(p => { const u = p.filter(m => m.id !== id); return u.map((m, i) => ({ ...m, az: u.length ? Math.round(360 / u.length * i) : 0 })); });

  const mk3d = async () => {
    if (!wImgs.length) return;
    setWBusy(true); setWStat("Oluşturuluyor..."); setWRes(null); setErr(null);
    try {
      const r = await fetch("/api/create-world", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: wImgs.map(m => ({ url: m.url, azimuth: m.az })), displayName: "Luxora AI 3D", textPrompt: wPrm || undefined, model: "marble-1.1" }) });
      if (!r.ok) throw new Error((await r.json()).error || "Hata");
      const { operationId } = await r.json();
      setWStat("Bu işlem 2-5 dk sürebilir...");
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const s = await (await fetch(`/api/world-status?operationId=${operationId}`)).json();
        if (s.status === "completed") { setWRes({ worldUrl: s.worldUrl, worldId: s.worldId }); setWStat("Hazır!"); return; }
        if (s.status === "failed") throw new Error(s.error || "Başarısız");
        setWStat(s.description || `Oluşturuluyor... (${(i+1)*5}s)`);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Hata"); }
    finally { setWBusy(false); }
  };

  if (!ok) return null;

  return (
    <main className="min-h-screen bg-[var(--bg)]">

      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-50 bg-[var(--bg)]/80 backdrop-blur-2xl border-b border-[var(--bdr)]">
        <div style={{ width: '100%', paddingLeft: 24, paddingRight: 24, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>

          {/* Logo — sol */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--gold-l)] to-[var(--gold-d)] flex items-center justify-center">
              <Crown size={16} className="text-black" />
            </div>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 500, letterSpacing: '0.04em', color: '#e8e0d4' }}>
              Luxora <span style={{ color: '#d4a537' }}>AI</span>
            </span>
          </div>

          {/* Tabs — ortada */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#1a1a1f', borderRadius: 50, padding: 4, border: '1px solid rgba(255,255,255,0.08)', gap: 2 }}>
              {[
                { k: "design" as const, icon: Sparkles, label: "AI Mimar" },
                { k: "3d" as const, icon: Box, label: "3D Dünya" },
              ].map(t => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 28px',
                    borderRadius: 50,
                    fontSize: 14,
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: tab === t.k ? '#d4a537' : 'transparent',
                    color: tab === t.k ? '#000' : '#666',
                    boxShadow: tab === t.k ? '0 2px 12px rgba(212,165,55,0.3)' : 'none',
                  }}
                >
                  <t.icon size={16} />{t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: 100 }} />
        </div>
      </header>

      {/* ===== CONTENT ===== */}
      <div style={{ maxWidth: 780, margin: '0 auto', paddingLeft: 24, paddingRight: 24, paddingTop: 32, paddingBottom: 32 }}>

        {/* ======================== DESIGN TAB ======================== */}
        {tab === "design" && (
          <div className="flex flex-col gap-6 fu">

            {/* ---- Oda Türü ---- */}
            <div style={{ backgroundColor: '#131316', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, padding: '20px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#666', marginBottom: 14 }}>Oda Türü</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                {ROOMS.map(r => {
                  const I = r.icon;
                  const on = room === r.id;
                  return (
                    <button key={r.id} onClick={() => setRoom(r.id)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      height: 40, padding: '0 16px',
                      borderRadius: 50, fontSize: 13, fontWeight: 500,
                      border: on ? '1.5px solid #d4a537' : '1px solid rgba(255,255,255,0.08)',
                      background: on ? 'rgba(212,165,55,0.1)' : 'rgba(255,255,255,0.03)',
                      color: on ? '#d4a537' : '#999',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}>
                      <I size={15} />{r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ---- Tasarım Stili ---- */}
            <div style={{ backgroundColor: '#131316', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, padding: '20px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#666', marginBottom: 14 }}>Tasarım Stili</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                {STYLES.map(s => {
                  const on = style === s.id;
                  return (
                    <button key={s.id} onClick={() => setStyle(s.id)} style={{
                      display: 'inline-flex', alignItems: 'center',
                      height: 40, padding: '0 16px',
                      borderRadius: 50, fontSize: 13, fontWeight: 500,
                      border: on ? '1.5px solid #d4a537' : '1px solid rgba(255,255,255,0.08)',
                      background: on ? 'rgba(212,165,55,0.1)' : 'rgba(255,255,255,0.03)',
                      color: on ? '#d4a537' : '#999',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ---- Ayarlar ---- */}
            <div style={{ backgroundColor: '#131316', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, padding: '18px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#666', marginBottom: 14 }}>Ayarlar</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 20 }}>
                {[
                  { l: "Duvar değiştir", v: walls, s: setWalls },
                  { l: "Zemin değiştir", v: floor, s: setFloor },
                  { l: "Aydınlatma değiştir", v: light, s: setLight },
                  { l: "Oda düzenini koru", v: keep, s: setKeep },
                ].map(o => (
                  <label key={o.l} className="flex items-center gap-2.5 cursor-pointer select-none group" onClick={() => o.s(!o.v)}>
                    <div style={{ position: 'relative', width: 42, height: 24, borderRadius: 50, transition: 'all 0.2s', backgroundColor: o.v ? '#d4a537' : '#222228' }}>
                      <div style={{ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', left: o.v ? 21 : 3 }} />
                    </div>
                    <span style={{ fontSize: 13, color: '#999', transition: 'color 0.2s' }}>{o.l}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* ---- Upload Area ---- */}
            <div className="fu3 w-full">
              <div
                className={`relative w-full rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all duration-200 ${
                  busy ? "border-[var(--bdr)] bg-[var(--bg-1)]" :
                  drag ? "border-[var(--gold)] bg-[var(--gold)]/5" :
                  img ? "border-transparent bg-[var(--bg-1)] rounded-2xl" :
                  "border-[var(--bdr)] bg-[var(--bg-1)] hover:border-[var(--bdr-2)] cursor-pointer min-h-[300px]"
                }`}
                onClick={() => !busy && !img && fileRef.current?.click()}
                onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={e => { e.preventDefault(); setDrag(false); }}
              >
                {!img && (
                  <div className="flex flex-col items-center gap-4 py-16">
                    <div className="w-14 h-14 rounded-xl bg-[var(--bg-3)] flex items-center justify-center">
                      <Upload size={24} className="text-[var(--t3)]" />
                    </div>
                    <div className="text-center">
                      <p className="text-[var(--t1)] font-medium text-[15px]">Oda fotoğrafı yükleyin</p>
                      <p className="text-[var(--t3)] text-sm mt-1">Sürükleyin veya tıklayarak seçin</p>
                    </div>
                  </div>
                )}

                {img && (
                  <>
                    <img src={img} alt="" className="w-full max-h-[400px] object-contain" />
                    {!busy && (
                      <button onClick={e => { e.stopPropagation(); setImg(null); setRes(null); }} className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-[var(--bg-3)]/80 hover:bg-red-500/70 flex items-center justify-center transition-all backdrop-blur-sm z-10">
                        <X size={15} className="text-white" />
                      </button>
                    )}
                    {busy && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-5 z-20">
                        <div className="relative w-20 h-20">
                          <svg className="w-20 h-20 -rotate-90">
                            <circle cx="40" cy="40" r="34" stroke="var(--bg-3)" strokeWidth="4" fill="none" />
                            <circle cx="40" cy="40" r="34" stroke="#d4a537" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={213.6} strokeDashoffset={213.6 - (213.6 * prog) / 100} className="transition-all duration-300" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-white text-lg font-semibold">{Math.round(prog)}%</span>
                          </div>
                        </div>
                        <p style={{ color: '#d4a537', fontSize: 14, fontWeight: 500 }}>{stat}</p>
                      </div>
                    )}
                  </>
                )}

                <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => e.target.files && onFile(e.target.files[0])} />
              </div>
            </div>

            {/* ---- Prompt ---- */}
            <div className="fu3 w-full" style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888', marginBottom: 10 }}>
                Ek Direktifler <span style={{ textTransform: 'none', letterSpacing: 'normal', opacity: 0.5 }}>(opsiyonel)</span>
              </div>
              <input
                type="text"
                value={prompt}
                onChange={e => setPrompt(e.target.value.slice(0, 500))}
                placeholder=""
                style={{
                  width: '100%',
                  height: 52,
                  backgroundColor: '#1a1a1f',
                  color: '#fff',
                  fontSize: 14,
                  padding: '0 20px',
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.1)',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(212,165,55,0.3)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            {/* ---- Generate Button ---- */}
            <button
              onClick={gen}
              disabled={!img || busy}
              style={{
                width: '100%', height: 52, borderRadius: 14, fontSize: 15, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                border: 'none', cursor: !img || busy ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                background: !img || busy ? '#222228' : '#d4a537',
                color: !img || busy ? '#666' : '#000',
                boxShadow: !img || busy ? 'none' : '0 4px 20px rgba(212,165,55,0.25)',
              }}
            >
              {busy ? <><Loader2 size={18} className="animate-spin" />Tasarlanıyor...</> : <>Tasarımı Başlat</>}
            </button>

            {/* ---- Error ---- */}
            {err && (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <Info size={15} className="text-red-400 shrink-0" />
                <span className="text-red-200/80 text-sm flex-1">{err}</span>
                <button onClick={() => setErr(null)} className="text-red-400/60 hover:text-red-300"><X size={14} /></button>
              </div>
            )}

            {/* ---- Result: Before/After ---- */}
            {res && img && (
              <div className="fu" style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>Sonuç</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={dl} style={{
                      height: 40, padding: '0 18px', borderRadius: 12,
                      backgroundColor: '#1a1a1f', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#aaa', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                    }}>
                      <Download size={14} />İndir
                    </button>
                    <button onClick={() => setRes(null)} style={{
                      height: 40, width: 40, borderRadius: 12,
                      backgroundColor: '#1a1a1f', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#666', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                    }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div
                  ref={cmpRef} className="cmp aspect-video"
                  onMouseDown={e => { setSliding(true); moveS(e.clientX); }}
                  onTouchStart={e => { setSliding(true); moveS(e.touches[0].clientX); }}
                >
                  <img src={res} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
                    <img src={img} alt="" className="absolute inset-0 h-full object-cover" style={{ width: `${100 / (pos / 100)}%`, maxWidth: "none" }} />
                  </div>
                  <div style={{ position: 'absolute', top: 12, left: 12, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, padding: '6px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.85)', zIndex: 20 }}>Öncesi</div>
                  <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, padding: '6px 14px', borderRadius: 8, background: 'rgba(212,165,55,0.2)', backdropFilter: 'blur(8px)', color: '#d4a537', zIndex: 20 }}>Sonrası</div>
                  <div className="cmp-line" style={{ left: `${pos}%` }}>
                    <div className="cmp-handle"><ArrowLeftRight size={16} className="text-black" /></div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: '#888' }}>
                  <span>{ROOMS.find(r => r.id === room)?.label}</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>{STYLES.find(s => s.id === style)?.label}</span>
                </div>
              </div>
            )}

            {/* ---- History ---- */}
            {hist.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#666', marginBottom: 14 }}>
                  Tamamlanan Tasarımlar ({hist.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  {hist.map(h => (
                    <div key={h.id} style={{ backgroundColor: '#131316', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setLightbox(h.orig)}>
                          <img src={h.orig} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block', transition: 'opacity 0.2s' }} onMouseOver={e => (e.target as HTMLImageElement).style.opacity = '0.8'} onMouseOut={e => (e.target as HTMLImageElement).style.opacity = '1'} />
                          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', padding: '5px 12px', borderRadius: 6 }}>Öncesi</span>
                        </div>
                        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setLightbox(h.result)}>
                          <img src={h.result} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block', transition: 'opacity 0.2s' }} onMouseOver={e => (e.target as HTMLImageElement).style.opacity = '0.8'} onMouseOut={e => (e.target as HTMLImageElement).style.opacity = '1'} />
                          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#d4a537', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', padding: '5px 12px', borderRadius: 6 }}>Sonrası</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                        <span style={{ fontSize: 13, color: '#888' }}>{h.room} · {h.style}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <button onClick={() => { setImg(h.orig); setRes(h.result); setPos(50); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ color: '#d4a537', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Karşılaştır</button>
                          <button onClick={() => { const a = document.createElement("a"); a.href = h.result; a.download = `luxora_${h.id}.png`; a.click(); }} style={{ color: '#666', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Download size={15} /></button>
                          <button onClick={() => setHist(p => p.filter(x => x.id !== h.id))} style={{ color: '#666', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Trash2 size={15} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================== 3D TAB ======================== */}
        {tab === "3d" && (
          <div className="flex flex-col gap-6 fu">

            <div>
              <h2 className="text-xl font-semibold mb-1" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                3D Dünya Oluştur
              </h2>
              <p className="text-[var(--t3)] text-sm">Oda görsellerinden gezinilebilir 3D ortam oluşturun</p>
            </div>

            {/* Images */}
            <div>
              <div className="text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--t3)] mb-3">
                Oda Görselleri <span className="normal-case tracking-normal opacity-50">(1–4 farklı açı)</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {wImgs.map(m => (
                  <div key={m.id} className="relative group w-[160px] h-[110px] rounded-xl overflow-hidden border border-[var(--bdr)] bg-[var(--bg-2)]">
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => rmWI(m.id)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/50 hover:bg-red-500/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm">
                      <X size={11} className="text-white" />
                    </button>
                    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/40 backdrop-blur rounded px-1.5 py-0.5">
                      <Compass size={9} className="text-blue-400" />
                      <span className="text-[9px] text-blue-300 font-mono">{m.az}°</span>
                    </div>
                  </div>
                ))}
                <button onClick={() => wFileRef.current?.click()} className="w-[160px] h-[110px] rounded-xl border-2 border-dashed border-[var(--bdr)] hover:border-purple-500/30 bg-[var(--bg-1)] hover:bg-purple-500/5 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer">
                  <Plus size={20} className="text-[var(--t3)]" />
                  <span className="text-[10px] text-[var(--t3)]">Görsel Ekle</span>
                </button>
                <input ref={wFileRef} type="file" accept="image/*" multiple hidden onChange={e => { if (e.target.files) Array.from(e.target.files).forEach(addWI); e.target.value = ""; }} />
              </div>
            </div>

            {wImgs.length > 0 && (
              <div>
                <div className="text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--t3)] mb-2">
                  Açıklama <span className="normal-case tracking-normal opacity-50">(opsiyonel)</span>
                </div>
                <input type="text" value={wPrm} onChange={e => setWPrm(e.target.value)} placeholder="Lüks modern salon, mermer zemin..." className="w-full h-12 bg-[var(--bg-2)] text-white text-sm px-4 rounded-xl border border-[var(--bdr)] focus:border-purple-500/30 focus:outline-none transition-all placeholder:text-[var(--t3)]" />
              </div>
            )}

            <button onClick={mk3d} disabled={!wImgs.length || wBusy} className={`w-full h-[52px] rounded-xl text-[15px] font-semibold flex items-center justify-center gap-3 transition-all duration-200 border-0 cursor-pointer ${!wImgs.length || wBusy ? "bg-[var(--bg-3)] text-[var(--t3)] cursor-not-allowed" : "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_4px_20px_rgba(99,102,241,0.25)] hover:shadow-[0_6px_28px_rgba(99,102,241,0.35)]"}`}>
              {wBusy ? <><Loader2 size={18} className="animate-spin" />{wStat}</> : <><Box size={18} />3D Dünya Oluştur{wImgs.length > 0 && <span className="text-white/50 font-normal">({wImgs.length})</span>}</>}
            </button>

            {wRes && (
              <div className="fu bg-[var(--bg-1)] border border-[var(--bdr)] rounded-2xl p-5 mt-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <Box size={16} className="text-purple-400" />3D Dünya Hazır
                  </h3>
                  <div className="flex gap-2">
                    <a href={wRes.worldUrl} target="_blank" rel="noopener noreferrer" className="h-9 px-4 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[12px] font-medium flex items-center gap-2 hover:shadow-lg transition-all"><ExternalLink size={13} />Tam Ekran</a>
                    <button onClick={() => setWRes(null)} className="h-9 w-9 rounded-lg bg-[var(--bg-2)] border border-[var(--bdr)] text-[var(--t3)] hover:text-white flex items-center justify-center transition-all"><RotateCcw size={14} /></button>
                  </div>
                </div>
                <div className="w-full aspect-video rounded-xl overflow-hidden border border-[var(--bdr)] bg-black">
                  <iframe src={wRes.worldUrl} className="w-full h-full border-0" allow="accelerometer; gyroscope; fullscreen" title="3D" />
                </div>
                <p className="text-[11px] text-[var(--t3)] mt-2.5 text-center">Mouse ile sürükleyin · Scroll ile yakınlaşın</p>
              </div>
            )}

            {err && tab === "3d" && (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <Info size={15} className="text-red-400 shrink-0" />
                <span className="text-red-200/80 text-sm flex-1">{err}</span>
                <button onClick={() => setErr(null)} className="text-red-400/60 hover:text-red-300"><X size={14} /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Lightbox Modal ---- */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 40, cursor: 'zoom-out',
          }}
        >
          <img
            src={lightbox}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '85vh',
              objectFit: 'contain', borderRadius: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              cursor: 'default',
            }}
          />
          {/* Close button */}
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute', top: 24, right: 24,
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(10px)',
            }}
          >
            <X size={20} />
          </button>
          {/* Download button */}
          <button
            onClick={e => {
              e.stopPropagation();
              const a = document.createElement('a');
              a.href = lightbox;
              a.download = `luxora_preview.png`;
              a.click();
            }}
            style={{
              position: 'absolute', bottom: 24, right: 24,
              height: 44, padding: '0 20px', borderRadius: 12,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 8,
              backdropFilter: 'blur(10px)',
            }}
          >
            <Download size={16} />İndir
          </button>
        </div>
      )}
    </main>
  );
}
