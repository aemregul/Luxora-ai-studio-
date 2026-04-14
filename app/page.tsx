"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Upload, X, Loader2, Download, Trash2, ArrowLeftRight,
  Home, UtensilsCrossed, Bath, BedDouble, Monitor, DoorOpen,
  Flower2, Armchair, Sparkles, Info, Box, Plus, ExternalLink,
  RotateCcw, Compass, Crown, Ship, Paintbrush, Grid3x3,
  Film, ChevronRight, ChevronLeft, Clock, Eye, Settings2, Wand2, Layers,
  PanelLeftClose, PanelLeftOpen, FolderOpen, ChevronDown, Pencil, Eraser, Minus,
  Play, ImagePlus,
} from "lucide-react";

// ============================================
// TYPES & DATA
// ============================================
type Tool = "redesign" | "inpaint" | "grid" | "video";
type Room = { id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };
type Style = { id: string; label: string };
type Result = { id: string; orig: string; result: string; room: string; style: string; ts: number; tool: Tool };
type Project = { id: string; name: string; createdAt: number; history: Result[] };

const LS_KEY = 'luxora_projects';
const loadProjects = (): Project[] => { try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : []; } catch { return []; } };
const saveProjects = (p: Project[]) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch (e) {
    // If storage full, try removing oldest items
    console.warn('localStorage save failed, trimming history...', e);
    const trimmed = p.map(proj => ({ ...proj, history: proj.history.slice(0, 10) }));
    try { localStorage.setItem(LS_KEY, JSON.stringify(trimmed)); } catch {}
  }
};

// Compress image to thumbnail for localStorage
const toThumb = (src: string, maxSize = 300): Promise<string> => {
  return new Promise(resolve => {
    // If it's a URL (not base64), keep as-is
    if (!src.startsWith('data:')) { resolve(src); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      c.width = img.width * scale;
      c.height = img.height * scale;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
};

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
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pos, setPos] = useState(50);
  const [sliding, setSliding] = useState(false);
  const [drag, setDrag] = useState(false);
  const [walls, setWalls] = useState(false);
  const [floor, setFloor] = useState(false);
  const [light, setLight] = useState(false);
  const [keep, setKeep] = useState(true);
  const [ok, setOk] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projId, setProjId] = useState<string | null>(null);
  const [projMenu, setProjMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  // Inpaint state
  const [brushSize, setBrushSize] = useState(30);
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintContainerRef = useRef<HTMLDivElement>(null);
  const isPainting = useRef(false);
  const lastPoint = useRef<{x: number, y: number} | null>(null);

  // Grid state
  const [gridPanels, setGridPanels] = useState<(string | null)[]>(Array(9).fill(null));
  const [gridBusy, setGridBusy] = useState(false);
  const [gridProgress, setGridProgress] = useState(0);
  const [gridDone, setGridDone] = useState(false);

  // Video state
  const [videoStartImg, setVideoStartImg] = useState<string | null>(null);
  const [videoEndImg, setVideoEndImg] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const startFileRef = useRef<HTMLInputElement>(null);
  const endFileRef = useRef<HTMLInputElement>(null);

  // Walkthrough state
  const [walkSegments, setWalkSegments] = useState<string[]>([]);
  const [walkBusy, setWalkBusy] = useState(false);
  const [walkProgress, setWalkProgress] = useState(0);
  const [walkCurrent, setWalkCurrent] = useState(0);
  const walkVideoRef = useRef<HTMLVideoElement>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cmpRef = useRef<HTMLDivElement>(null);
  const sideTimer = useRef<NodeJS.Timeout | null>(null);

  // Current project
  const proj = projects.find(p => p.id === projId) || null;
  const hist = proj?.history || [];

  useEffect(() => {
    setOk(true);
    const loaded = loadProjects();
    if (loaded.length > 0) {
      setProjects(loaded);
      setProjId(loaded[0].id);
    }
    // Migrate old history
    try {
      const old = localStorage.getItem('luxora_history');
      if (old && loaded.length === 0) {
        const oldHist: Result[] = JSON.parse(old);
        if (oldHist.length > 0) {
          const migrated: Project = { id: Date.now() + '', name: 'Eski Tasarımlar', createdAt: Date.now(), history: oldHist };
          setProjects([migrated]);
          setProjId(migrated.id);
          saveProjects([migrated]);
          localStorage.removeItem('luxora_history');
        }
      }
    } catch {}
  }, []);

  // Project helpers
  const newProject = () => {
    const p: Project = { id: Date.now() + '', name: `Proje ${projects.length + 1}`, createdAt: Date.now(), history: [] };
    const updated = [p, ...projects];
    setProjects(updated); setProjId(p.id); saveProjects(updated);
    setImg(null); setRes(null); setProjMenu(false);
  };

  const deleteProject = (id: string) => {
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated); saveProjects(updated);
    if (projId === id) { setProjId(updated[0]?.id || null); setImg(null); setRes(null); }
  };

  const renameProject = (id: string, name: string) => {
    const updated = projects.map(p => p.id === id ? { ...p, name } : p);
    setProjects(updated); saveProjects(updated); setRenaming(null);
  };

  const addToHistory = async (item: Result) => {
    if (!projId) return;
    // Compress images for storage
    const [thumbOrig, thumbRes] = await Promise.all([toThumb(item.orig), toThumb(item.result)]);
    const storageItem: Result = { ...item, orig: thumbOrig, result: thumbRes };
    const updated = projects.map(p => p.id === projId ? { ...p, history: [storageItem, ...p.history].slice(0, 50) } : p);
    setProjects(updated); saveProjects(updated);
  };

  // Lightbox ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    if (lightbox) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [lightbox]);

  // File
  const onFile = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    // Auto-create project if none exists
    if (!projId) {
      const p: Project = { id: Date.now() + '', name: 'Proje 1', createdAt: Date.now(), history: [] };
      const updated = [p, ...projects];
      setProjects(updated); setProjId(p.id); saveProjects(updated);
    }
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
        addToHistory(newItem);
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

  // ============ INPAINT ============
  const initMaskCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current;
    const container = paintContainerRef.current;
    if (!canvas || !container) return;
    const imgEl = container.querySelector('img');
    if (!imgEl) return;
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const getCanvasPoint = (e: React.MouseEvent) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const drawBrush = (x: number, y: number) => {
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const canvas = maskCanvasRef.current!;
    const scale = canvas.width / (paintContainerRef.current?.getBoundingClientRect().width || canvas.width);
    const size = brushSize * scale;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    // Draw line from last point for smooth strokes
    if (lastPoint.current) {
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastPoint.current = { x, y };
  };

  const startPaint = (e: React.MouseEvent) => {
    isPainting.current = true;
    lastPoint.current = null;
    const pt = getCanvasPoint(e);
    if (pt) drawBrush(pt.x, pt.y);
  };

  const movePaint = (e: React.MouseEvent) => {
    if (!isPainting.current) return;
    const pt = getCanvasPoint(e);
    if (pt) drawBrush(pt.x, pt.y);
  };

  const stopPaint = () => {
    isPainting.current = false;
    lastPoint.current = null;
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  };

  const getMaskDataURL = () => {
    return maskCanvasRef.current?.toDataURL('image/png') || null;
  };

  const genInpaint = async () => {
    if (!img) return;
    const mask = getMaskDataURL();
    if (!mask) { setErr('Düzenlenecek alanı seçin'); return; }
    setBusy(true); setProg(0); setStat('Maske hazırlanıyor...'); setErr(null); setRes(null);
    let iv: NodeJS.Timeout | null = null; let done = false;
    iv = setInterval(() => { if (done) { if (iv) clearInterval(iv); return; } setProg(p => { if (p < 95) { const n = p + 1.2; setStat(n < 30 ? 'Maske işleniyor...' : n < 60 ? 'Bölge düzenleniyor...' : n < 80 ? 'Detaylar ekleniyor...' : 'Tamamlanıyor...'); return n; } return p; }); }, 500);
    try {
      const r = await fetch('/api/inpaint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: img, mask, prompt: inpaintPrompt }) });
      if (!r.ok) throw new Error((await r.json()).error || 'Hata');
      const d = await r.json();
      if (d.success && d.resultImage) {
        done = true; if (iv) clearInterval(iv); setProg(100); setStat('Tamamlandı!');
        await new Promise(r => setTimeout(r, 400));
        setRes(d.resultImage); setPos(50);
        addToHistory({ id: Date.now() + '', orig: img, result: d.resultImage, room: 'Inpaint', style: inpaintPrompt || 'Bölgesel', ts: Date.now(), tool: 'inpaint' });
      } else throw new Error('Üretilemedi');
    } catch (e) { done = true; if (iv) clearInterval(iv); setProg(0); setErr(e instanceof Error ? e.message : 'Hata'); }
    finally { setBusy(false); }
  };

  // ============ GRID ============
  const genGrid = async () => {
    if (!img) return;
    setGridBusy(true); setGridDone(false); setGridProgress(0); setErr(null);
    setGridPanels(Array(9).fill(null));
    const roomLabel = ROOMS.find(r => r.id === room)?.label || room;
    const styleLabel = STYLES.find(s => s.id === style)?.label || style;

    let completed = 0;
    // Generate 9 panels in batches of 3
    for (let batch = 0; batch < 3; batch++) {
      const batchPromises = [0, 1, 2].map(i => {
        const idx = batch * 3 + i;
        return fetch('/api/grid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: img, panelIndex: idx, roomType: roomLabel, designStyle: styleLabel }),
        })
          .then(r => r.json())
          .then(d => {
            if (d.success && d.imageUrl) {
              setGridPanels(prev => { const n = [...prev]; n[idx] = d.imageUrl; return n; });
            }
            completed++;
            setGridProgress(Math.round((completed / 9) * 100));
          })
          .catch(() => { completed++; setGridProgress(Math.round((completed / 9) * 100)); });
      });
      await Promise.all(batchPromises);
    }
    setGridBusy(false); setGridDone(true);
  };

  // ============ VIDEO ============
  const onVideoFile = (f: File, type: 'start' | 'end') => {
    if (!f.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => {
      if (type === 'start') setVideoStartImg(r.result as string);
      else setVideoEndImg(r.result as string);
    };
    r.readAsDataURL(f);
  };

  const genVideo = async () => {
    if (!videoStartImg) return;
    setVideoBusy(true); setVideoProgress(0); setVideoResult(null); setErr(null);

    // Fake progress (video takes long)
    const iv = setInterval(() => {
      setVideoProgress(p => p < 90 ? p + 0.5 : p);
    }, 1000);

    try {
      const r = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startImage: videoStartImg,
          endImage: videoEndImg,
          prompt: videoPrompt,
          duration: videoDuration,
        }),
      });
      clearInterval(iv);
      if (!r.ok) throw new Error((await r.json()).error || 'Hata');
      const d = await r.json();
      if (d.success && d.videoUrl) {
        setVideoProgress(100);
        await new Promise(r => setTimeout(r, 400));
        setVideoResult(d.videoUrl);
      } else throw new Error('Video üretilemedi');
    } catch (e) {
      clearInterval(iv); setVideoProgress(0);
      setErr(e instanceof Error ? e.message : 'Video hatası');
    } finally { setVideoBusy(false); }
  };

  // ============ WALKTHROUGH ============
  const WALK_ROUTE = [0, 1, 3, 4, 8, 5]; // Kapı → Sol → Pencere → Ters → Panoramik → Kuş

  const genWalkthrough = async () => {
    const available = WALK_ROUTE.filter(i => gridPanels[i]);
    if (available.length < 2) { setErr('En az 2 açı paneli gerekli'); return; }

    setWalkBusy(true); setWalkProgress(0); setWalkSegments([]); setWalkCurrent(0); setErr(null);
    const segments: string[] = [];
    const totalPairs = available.length - 1;

    for (let i = 0; i < totalPairs; i++) {
      const startPanel = gridPanels[available[i]]!;
      const endPanel = gridPanels[available[i + 1]]!;
      setWalkProgress(Math.round((i / totalPairs) * 100));

      try {
        const r = await fetch('/api/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startImage: startPanel,
            endImage: endPanel,
            prompt: 'Smooth cinematic camera transition between two angles of the same room, slow dolly movement, professional architectural videography',
            duration: 5,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.success && d.videoUrl) {
            segments.push(d.videoUrl);
            setWalkSegments([...segments]);
          }
        }
      } catch {}
    }

    setWalkProgress(100);
    setWalkBusy(false);
  };

  const playNextSegment = () => {
    if (walkCurrent < walkSegments.length - 1) {
      setWalkCurrent(prev => prev + 1);
    } else {
      setWalkCurrent(0); // loop
    }
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

          {/* Separator */}
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

          {/* Project Selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setProjMenu(!projMenu)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 34, padding: '0 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#ccc', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <FolderOpen size={14} color="#d4a537" />
              <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {proj?.name || 'Proje Seç'}
              </span>
              <ChevronDown size={12} color="#666" />
            </button>

            {/* Project Dropdown */}
            {projMenu && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6,
                  width: 280, maxHeight: 360, overflowY: 'auto',
                  background: '#1a1a1f', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                  zIndex: 100, padding: '6px',
                }}
              >
                {/* New Project */}
                <button
                  onClick={newProject}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(212,165,55,0.06)', border: '1px dashed rgba(212,165,55,0.2)',
                    color: '#d4a537', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    marginBottom: 4, transition: 'all 0.15s',
                  }}
                >
                  <Plus size={14} /> Yeni Proje Oluştur
                </button>

                {projects.length === 0 && (
                  <div style={{ padding: '16px 12px', textAlign: 'center', color: '#444', fontSize: 12 }}>
                    Henüz proje yok
                  </div>
                )}

                {projects.map(p => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s',
                      background: p.id === projId ? 'rgba(212,165,55,0.08)' : 'transparent',
                    }}
                    onMouseOver={e => { if (p.id !== projId) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseOut={e => { if (p.id !== projId) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div
                      onClick={() => { setProjId(p.id); setProjMenu(false); setImg(null); setRes(null); }}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      {renaming === p.id ? (
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => renameProject(p.id, renameVal || p.name)}
                          onKeyDown={e => { if (e.key === 'Enter') renameProject(p.id, renameVal || p.name); }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,165,55,0.3)', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 12, outline: 'none' }}
                        />
                      ) : (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 500, color: p.id === projId ? '#d4a537' : '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
                            {p.history.length} tasarım · {new Date(p.createdAt).toLocaleDateString('tr-TR')}
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setRenaming(p.id); setRenameVal(p.name); }}
                      style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.color = '#aaa'}
                      onMouseOut={e => e.currentTarget.style.color = '#555'}
                      title="Yeniden adlandır"
                    >
                      <Pencil size={12} />
                    </button>
                    {projects.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteProject(p.id); }}
                        style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s' }}
                        onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseOut={e => e.currentTarget.style.color = '#444'}
                        title="Projeyi sil"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#666' }}>v2.0</span>
        </div>
      </header>

      {/* Close project menu overlay */}
      {projMenu && <div onClick={() => setProjMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />}

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

        {/* === HAS IMAGE: Show it (Redesign mode) === */}
        {img && !res && (tool === 'redesign' || (tool === 'grid' && !gridPanels.some(p => p !== null))) && (
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

        {/* === INPAINT CANVAS MODE === */}
        {img && !res && tool === 'inpaint' && (
          <div className="fade-in" style={{ position: 'relative', width: '100%', maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Paintbrush size={14} color="#d4a537" />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#ccc' }}>Düzenlenecek alanı boyayın</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={clearMask} style={{ height: 30, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#888', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Eraser size={12} />Temizle
                </button>
                <button onClick={() => { setImg(null); setRes(null); }} style={{ height: 30, width: 30, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={12} />
                </button>
              </div>
            </div>

            <div
              ref={paintContainerRef}
              style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: 'crosshair' }}
            >
              <img
                src={img}
                alt=""
                style={{ width: '100%', display: 'block' }}
                onLoad={() => initMaskCanvas()}
              />
              <canvas
                ref={maskCanvasRef}
                onMouseDown={startPaint}
                onMouseMove={movePaint}
                onMouseUp={stopPaint}
                onMouseLeave={stopPaint}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  opacity: 0.45, mixBlendMode: 'screen',
                  cursor: 'crosshair',
                }}
              />
            </div>

            {/* Progress overlay for inpaint */}
            {busy && (
              <div style={{ position: 'absolute', inset: 0, top: 40, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 20, borderRadius: 12 }}>
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

            <p style={{ fontSize: 10, color: '#444', marginTop: 8, textAlign: 'center' }}>
              Beyaz alanlar düzenlenecek · Siyah alanlar korunacak
            </p>
          </div>
        )}

        {/* === GRID RESULTS === */}
        {tool === 'grid' && img && gridPanels.some(p => p !== null) && (
          <div className="fade-in" style={{ width: '100%', maxWidth: 800 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Grid3x3 size={14} color="#d4a537" />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#ccc' }}>Çoklu Açı Sonuçları</span>
                <span style={{ fontSize: 10, color: '#555' }}>({gridPanels.filter(Boolean).length}/9)</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {gridPanels.map((panel, i) => (
                <div
                  key={i}
                  onClick={() => panel && setLightbox(panel)}
                  style={{
                    aspectRatio: '16/10', borderRadius: 8, overflow: 'hidden',
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    cursor: panel ? 'zoom-in' : 'default',
                    position: 'relative', transition: 'border-color 0.15s',
                  }}
                  onMouseOver={e => { if (panel) e.currentTarget.style.borderColor = 'rgba(212,165,55,0.3)'; }}
                  onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                >
                  {panel ? (
                    <img src={panel} alt={`Açı ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {gridBusy ? (
                        <Loader2 size={16} color="#333" className="animate-spin" />
                      ) : (
                        <span style={{ fontSize: 10, color: '#333' }}>{i + 1}</span>
                      )}
                    </div>
                  )}
                  {/* Label */}
                  {panel && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      padding: '8px 6px 4px', fontSize: 9, color: '#ccc',
                      background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                      textAlign: 'center',
                    }}>
                      {['Kapıdan', 'Sol Duvar', 'Sağ Duvar', 'Pencere', 'Ters Açı', 'Kuş Bakışı', 'Yerden', 'Detay', '3/4 Açı'][i]}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            {gridDone && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { setImg(null); setGridPanels(Array(9).fill(null)); setGridDone(false); setWalkSegments([]); }}
                    style={{
                      flex: 1, height: 36, borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#aaa', fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Upload size={12} />Yeni Görsel
                  </button>
                  <button
                    onClick={genGrid}
                    style={{
                      flex: 1, height: 36, borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#aaa', fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <RotateCcw size={12} />Tekrar Üret
                  </button>
                </div>

                {/* Walkthrough Button */}
                <button
                  onClick={genWalkthrough}
                  disabled={walkBusy || gridPanels.filter(Boolean).length < 2}
                  style={{
                    width: '100%', height: 40, marginTop: 8, borderRadius: 10,
                    background: walkBusy ? 'rgba(212,165,55,0.04)' : 'linear-gradient(135deg, rgba(212,165,55,0.15), rgba(212,165,55,0.05))',
                    border: '1px solid rgba(212,165,55,0.3)',
                    color: '#d4a537', fontSize: 13, fontWeight: 600, cursor: walkBusy ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: walkBusy || gridPanels.filter(Boolean).length < 2 ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {walkBusy ? (
                    <><Loader2 size={14} className="animate-spin" />Walkthrough Oluşturuluyor ({walkProgress}%)...</>
                  ) : (
                    <><Film size={14} />🎬 Walkthrough Video Oluştur</>
                  )}
                </button>

                {/* Walkthrough Progress */}
                {walkBusy && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${walkProgress}%`, background: '#d4a537', borderRadius: 2, transition: 'width 0.5s' }} />
                    </div>
                    <p style={{ fontSize: 10, color: '#555', marginTop: 4, textAlign: 'center' }}>
                      {walkSegments.length} segment hazır — toplam {walkSegments.length * 5}s video
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Walkthrough Video Player */}
            {walkSegments.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Film size={12} color="#d4a537" />
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#ccc' }}>Walkthrough</span>
                    <span style={{ fontSize: 10, color: '#555' }}>
                      Segment {walkCurrent + 1}/{walkSegments.length}
                    </span>
                  </div>
                  <a
                    href={walkSegments[walkCurrent]}
                    download={`luxora_walk_seg${walkCurrent + 1}.mp4`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      height: 26, padding: '0 10px', borderRadius: 6,
                      background: 'rgba(212,165,55,0.08)', border: '1px solid rgba(212,165,55,0.2)',
                      color: '#d4a537', fontSize: 10, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                      textDecoration: 'none',
                    }}
                  >
                    <Download size={10} />İndir
                  </a>
                </div>

                <div style={{ borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                  <video
                    ref={walkVideoRef}
                    key={walkSegments[walkCurrent]}
                    src={walkSegments[walkCurrent]}
                    autoPlay
                    onEnded={playNextSegment}
                    controls
                    style={{ width: '100%', display: 'block' }}
                  />
                </div>

                {/* Segment indicators */}
                <div style={{ display: 'flex', gap: 3, marginTop: 8, justifyContent: 'center' }}>
                  {walkSegments.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setWalkCurrent(i)}
                      style={{
                        width: i === walkCurrent ? 24 : 8, height: 8,
                        borderRadius: 4, border: 'none', cursor: 'pointer',
                        background: i === walkCurrent ? '#d4a537' : 'rgba(255,255,255,0.1)',
                        transition: 'all 0.2s',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* === VIDEO RESULT === */}
        {videoResult && tool === 'video' && (
          <div className="fade-in" style={{ width: '100%', maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Film size={14} color="#d4a537" />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#ccc' }}>Video Sonucu</span>
                <span style={{ fontSize: 10, color: '#555' }}>{videoDuration}s</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <a
                  href={videoResult}
                  download={`luxora_video_${Date.now()}.mp4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    height: 32, padding: '0 12px', borderRadius: 8,
                    backgroundColor: 'rgba(212,165,55,0.08)', border: '1px solid rgba(212,165,55,0.2)',
                    color: '#d4a537', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    textDecoration: 'none',
                  }}
                >
                  <Download size={12} />İndir
                </a>
              </div>
            </div>

            <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000' }}>
              <video
                src={videoResult}
                controls
                autoPlay
                loop
                style={{ width: '100%', display: 'block' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => { setVideoResult(null); setVideoStartImg(null); setVideoEndImg(null); }}
                style={{
                  flex: 1, height: 36, borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#aaa', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Upload size={12} />Yeni Video
              </button>
              <button
                onClick={() => { setVideoResult(null); genVideo(); }}
                style={{
                  flex: 1, height: 36, borderRadius: 10,
                  background: 'rgba(212,165,55,0.08)', border: '1px solid rgba(212,165,55,0.2)',
                  color: '#d4a537', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <RotateCcw size={12} />Tekrar Üret
              </button>
            </div>
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

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setImg(null); setRes(null); }}
                style={{
                  flex: 1, height: 40, borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#aaa', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}
              >
                <Upload size={14} />Yeni Görsel Yükle
              </button>
              <button
                onClick={() => { setRes(null); }}
                style={{
                  flex: 1, height: 40, borderRadius: 10,
                  background: 'rgba(212,165,55,0.08)', border: '1px solid rgba(212,165,55,0.2)',
                  color: '#d4a537', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}
              >
                <RotateCcw size={14} />Tekrar Dene
              </button>
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

        {/* === INPAINT TOOL === */}
        {tool === "inpaint" && (
          <div className="fade-in">
            <div className="panel-section">
              <div className="panel-label">Bölgesel Düzenleme</div>
              <p style={{ fontSize: 11, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>
                Görsel üzerinde düzenlemek istediğiniz alanı fırça ile boyayın, ne yapılmasını istediğinizi yazın.
              </p>
            </div>

            {/* Brush Size */}
            <div className="panel-section">
              <div className="panel-label">Fırça Boyutu</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Minus size={12} color="#555" />
                <input
                  type="range"
                  min="5" max="80" value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#d4a537' }}
                />
                <Plus size={12} color="#555" />
                <span style={{ fontSize: 11, color: '#888', minWidth: 28, textAlign: 'right' }}>{brushSize}px</span>
              </div>
              {/* Brush preview */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                <div style={{
                  width: brushSize, height: brushSize, maxWidth: 60, maxHeight: 60,
                  borderRadius: '50%', border: '2px solid rgba(212,165,55,0.5)',
                  background: 'rgba(212,165,55,0.15)',
                  transition: 'all 0.15s',
                }} />
              </div>
            </div>

            {/* Inpaint Prompt */}
            <div className="panel-section">
              <div className="panel-label">Ne yapılsın? <span style={{ textTransform: 'none', letterSpacing: 'normal', opacity: 0.5, fontWeight: 400 }}>(opsiyonel)</span></div>
              <textarea
                value={inpaintPrompt}
                onChange={e => setInpaintPrompt(e.target.value.slice(0, 300))}
                placeholder="Örn: Burayı şömine ile değiştir... (Boş bırakırsan siler)"
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

            {/* Quick Actions */}
            <div className="panel-section">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {['Kaldır', 'Şömine koy', 'Bitki ekle', 'Tablo as', 'Ayna koy'].map(q => (
                  <button
                    key={q}
                    onClick={() => setInpaintPrompt(q === 'Kaldır' ? '' : q)}
                    style={{
                      height: 28, padding: '0 10px', borderRadius: 6,
                      background: (q === 'Kaldır' && !inpaintPrompt) || inpaintPrompt === q ? 'rgba(212,165,55,0.1)' : 'rgba(255,255,255,0.03)',
                      border: '1px solid ' + ((q === 'Kaldır' && !inpaintPrompt) || inpaintPrompt === q ? 'rgba(212,165,55,0.3)' : 'rgba(255,255,255,0.06)'),
                      color: (q === 'Kaldır' && !inpaintPrompt) || inpaintPrompt === q ? '#d4a537' : '#666',
                      fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Inpaint */}
            <button
              onClick={genInpaint}
              disabled={!img || busy}
              className={`btn-generate ${!img || busy ? 'disabled' : 'ready'}`}
            >
              {busy ? <><Loader2 size={16} className="animate-spin" />Düzenleniyor...</> : <><Paintbrush size={16} />Bölgeyi Düzenle</>}
            </button>
          </div>
        )}

        {/* === GRID TOOL === */}
        {tool === "grid" && (
          <div className="fade-in">
            <div className="panel-section">
              <div className="panel-label">Çoklu Açı Üretme</div>
              <p style={{ fontSize: 11, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>
                Yüklediğiniz oda fotoğrafından 9 farklı kamera açısı üretin. Her panel aynı odayı farklı perspektiften gösterir.
              </p>
            </div>

            {/* Grid info */}
            <div className="panel-section">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                {['Kapıdan', 'Sol', 'Sağ', 'Pencere', 'Ters Açı', 'Kuş Bakışı', 'Yerden', 'Detay', '3/4 Açı'].map((label, i) => (
                  <div key={i} style={{
                    fontSize: 9, textAlign: 'center', padding: '6px 2px',
                    borderRadius: 6, background: gridPanels[i] ? 'rgba(212,165,55,0.08)' : 'rgba(255,255,255,0.02)',
                    border: '1px solid ' + (gridPanels[i] ? 'rgba(212,165,55,0.2)' : 'rgba(255,255,255,0.04)'),
                    color: gridPanels[i] ? '#d4a537' : '#444',
                  }}>
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Progress */}
            {gridBusy && (
              <div className="panel-section">
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${gridProgress}%`, background: '#d4a537', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                <p style={{ fontSize: 10, color: '#888', marginTop: 6, textAlign: 'center' }}>
                  {gridProgress}% — {Math.round(gridProgress / 100 * 9)}/9 panel
                </p>
              </div>
            )}

            {/* Generate */}
            <button
              onClick={genGrid}
              disabled={!img || gridBusy}
              className={`btn-generate ${!img || gridBusy ? 'disabled' : 'ready'}`}
            >
              {gridBusy ? <><Loader2 size={16} className="animate-spin" />Üretiliyor ({gridProgress}%)...</> : <><Grid3x3 size={16} />9 Açı Üret</>}
            </button>

            {/* Reset */}
            {gridDone && (
              <button
                onClick={() => { setGridPanels(Array(9).fill(null)); setGridDone(false); }}
                style={{
                  width: '100%', height: 36, marginTop: 8, borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#888', fontSize: 12, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <RotateCcw size={12} />Yeniden Üret
              </button>
            )}
          </div>
        )}

        {/* === VIDEO TOOL === */}
        {tool === "video" && (
          <div className="fade-in">
            <div className="panel-section">
              <div className="panel-label">Video Oluşturma</div>
              <p style={{ fontSize: 11, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>
                Başlangıç ve bitiş frame yükleyin, Seedance 2.0 ile sinematik walkthrough video oluşturun.
              </p>
            </div>

            {/* Start Frame */}
            <div className="panel-section">
              <div className="panel-label">Başlangıç Frame <span style={{ color: '#ef4444', fontWeight: 400 }}>*</span></div>
              <div
                onClick={() => startFileRef.current?.click()}
                style={{
                  height: 80, borderRadius: 10, cursor: 'pointer',
                  border: '1px dashed ' + (videoStartImg ? 'rgba(212,165,55,0.3)' : 'rgba(255,255,255,0.1)'),
                  background: videoStartImg ? 'transparent' : 'rgba(255,255,255,0.02)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', position: 'relative',
                }}
              >
                {videoStartImg ? (
                  <>
                    <img src={videoStartImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      onClick={e => { e.stopPropagation(); setVideoStartImg(null); }}
                      style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 4, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    ><X size={10} /></button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <ImagePlus size={18} color="#444" style={{ margin: '0 auto 4px' }} />
                    <p style={{ fontSize: 10, color: '#444' }}>Başlangıç görseli yükle</p>
                  </div>
                )}
              </div>
              <input ref={startFileRef} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && onVideoFile(e.target.files[0], 'start')} />
            </div>

            {/* End Frame */}
            <div className="panel-section">
              <div className="panel-label">Bitiş Frame <span style={{ textTransform: 'none', letterSpacing: 'normal', opacity: 0.5, fontWeight: 400 }}>(opsiyonel)</span></div>
              <div
                onClick={() => endFileRef.current?.click()}
                style={{
                  height: 80, borderRadius: 10, cursor: 'pointer',
                  border: '1px dashed ' + (videoEndImg ? 'rgba(212,165,55,0.3)' : 'rgba(255,255,255,0.08)'),
                  background: videoEndImg ? 'transparent' : 'rgba(255,255,255,0.02)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', position: 'relative',
                }}
              >
                {videoEndImg ? (
                  <>
                    <img src={videoEndImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      onClick={e => { e.stopPropagation(); setVideoEndImg(null); }}
                      style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 4, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    ><X size={10} /></button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <ImagePlus size={16} color="#333" style={{ margin: '0 auto 4px' }} />
                    <p style={{ fontSize: 10, color: '#333' }}>Bitiş görseli (opsiyonel)</p>
                  </div>
                )}
              </div>
              <input ref={endFileRef} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && onVideoFile(e.target.files[0], 'end')} />
            </div>

            {/* Duration Slider */}
            <div className="panel-section">
              <div className="panel-label">Video Süresi</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, color: '#555' }}>5s</span>
                <input
                  type="range"
                  min="5" max="15" value={videoDuration}
                  onChange={e => setVideoDuration(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#d4a537' }}
                />
                <span style={{ fontSize: 10, color: '#555' }}>15s</span>
                <span style={{ fontSize: 12, color: '#d4a537', fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{videoDuration}s</span>
              </div>
            </div>

            {/* Video Prompt */}
            <div className="panel-section">
              <div className="panel-label">Hareket Tanımı <span style={{ textTransform: 'none', letterSpacing: 'normal', opacity: 0.5, fontWeight: 400 }}>(opsiyonel)</span></div>
              <textarea
                value={videoPrompt}
                onChange={e => setVideoPrompt(e.target.value.slice(0, 300))}
                placeholder="Örn: Yavaş kamera hareketi ile odada dolaş..."
                rows={2}
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

            {/* Quick prompts */}
            <div className="panel-section">
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                {['Yavaş dolly', 'Pan sağa', 'İleri yürü', 'Zoom in', 'Orbit dönüş'].map(q => (
                  <button
                    key={q}
                    onClick={() => setVideoPrompt(q)}
                    style={{
                      height: 26, padding: '0 8px', borderRadius: 6,
                      background: videoPrompt === q ? 'rgba(212,165,55,0.1)' : 'rgba(255,255,255,0.03)',
                      border: '1px solid ' + (videoPrompt === q ? 'rgba(212,165,55,0.3)' : 'rgba(255,255,255,0.06)'),
                      color: videoPrompt === q ? '#d4a537' : '#555',
                      fontSize: 10, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Progress */}
            {videoBusy && (
              <div className="panel-section">
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${videoProgress}%`, background: '#d4a537', borderRadius: 2, transition: 'width 0.5s' }} />
                </div>
                <p style={{ fontSize: 10, color: '#888', marginTop: 6, textAlign: 'center' }}>
                  Video oluşturuluyor... ({Math.round(videoProgress)}%)
                </p>
              </div>
            )}

            {/* Generate */}
            <button
              onClick={genVideo}
              disabled={!videoStartImg || videoBusy}
              className={`btn-generate ${!videoStartImg || videoBusy ? 'disabled' : 'ready'}`}
            >
              {videoBusy ? <><Loader2 size={16} className="animate-spin" />Oluşturuluyor...</> : <><Play size={16} />Video Oluştur</>}
            </button>
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
