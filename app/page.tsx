/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface FurnitureItem {
  id: string;
  name: string;
  thumbnail: string;
  fabricObj: any;
  direction?: string;
}

interface Annotation {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

const STYLES = [
  { id: "nordico", label: "Nórdico", desc: "Madera clara, blanco, minimalismo" },
  { id: "industrial", label: "Industrial", desc: "Metal, madera oscura, ladrillo visto" },
  { id: "minimalista", label: "Minimalista", desc: "Líneas limpias, paleta neutra" },
  { id: "mediterraneo", label: "Mediterráneo", desc: "Terracota, lino, calidez natural" },
  { id: "japandi", label: "Japandi", desc: "Japonés + escandinavo, wabi-sabi" },
  { id: "bohemio", label: "Bohemio", desc: "Ecléctico, plantas, textiles, color" },
  { id: "art_deco", label: "Art Déco", desc: "Geométrico, lujoso, detalles dorados" },
  { id: "rustico", label: "Rústico", desc: "Madera, piedra, materiales naturales" },
  { id: "clasico", label: "Clásico", desc: "Elegante, formal, tonos cálidos" },
  { id: "contemporaneo", label: "Contemporáneo", desc: "Tendencias actuales, neutro + acento" },
];

export default function HomePage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<any>(null);
  const canvasObjRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [color, setColor] = useState("#000000");
  const [colorAlpha, setColorAlpha] = useState(0);
  const [scaleVal, setScaleVal] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportQuality, setExportQuality] = useState<"web" | "hd" | "print">("hd");
  const [roomName, setRoomName] = useState("Sala");

  // Style selection
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [showStylePanel, setShowStylePanel] = useState(false);

  // Reference / inspiration photo
  const [referencePhotoBase64, setReferencePhotoBase64] = useState<string | null>(null);

  // Initial prompt (pre-render, from the start)
  const [initialPrompt, setInitialPrompt] = useState("");

  // Refinement prompt (post-render)
  const [refinementPrompt, setRefinementPrompt] = useState("");

  // Original room photo WITHOUT added furniture — sent as reference to Gemini
  const [originalRoomBase64, setOriginalRoomBase64] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [drawingAnn, setDrawingAnn] = useState<{x:number;y:number;w:number;h:number}|null>(null);
  const annStartRef = useRef<{x:number;y:number}|null>(null);
  const isAnnotatingRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const roomInputRef = useRef<HTMLInputElement>(null);
  const furnitureInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const getSizePct = (obj: any) => {
    const base = obj.data?.baseScale || 1;
    return Math.round(Math.abs((obj.scaleY || base) / base) * 100);
  };

  useEffect(() => {
    let mounted = true;
    import("fabric").then((mod) => {
      if (!mounted) return;
      const fabric = (mod as any).fabric
        ?? (mod as any).default?.fabric
        ?? (mod as any).default
        ?? mod;
      fabricRef.current = fabric;

      if (!fabric?.Canvas) {
        setErrorMsg("No se pudo cargar Fabric.js. Recarga la pagina.");
        return;
      }
      if (!canvasRef.current) {
        setErrorMsg("Canvas no encontrado. Recarga la pagina.");
        return;
      }

      try {
        const el = document.createElement("canvas");
        canvasRef.current.appendChild(el);

        const canvas = new fabric.Canvas(el, {
          width: 880,
          height: 580,
          backgroundColor: "#F5F4F2",
          preserveObjectStacking: true,
        });
        canvasObjRef.current = canvas;

        canvas.on("selection:created", (e: any) => {
          const obj = e.selected?.[0];
          if (obj) updateSelectedState(obj);
        });
        canvas.on("selection:updated", (e: any) => {
          const obj = e.selected?.[0];
          if (obj) updateSelectedState(obj);
        });
        canvas.on("selection:cleared", () => setSelected(null));

        canvas.on("object:scaling", (e: any) => {
          if (!e.target) return;
          const obj = e.target;
          const base = obj.data?.baseScale || 1;
          const sizePct = Math.abs(obj.scaleY / base);
          obj.scaleX = sizePct * base;
          setScaleVal(Math.round(sizePct * 100));
        });

        canvas.on("object:scaled", (e: any) => {
          if (!e.target) return;
          const obj = e.target;
          const base = obj.data?.baseScale || 1;
          const sizePct = Math.abs(obj.scaleY / base);
          obj.set({ scaleX: sizePct * base, data: { ...obj.data, sizePercent: sizePct } });
          canvas.renderAll();
        });

        setIsReady(true);
      } catch (err: any) {
        setErrorMsg("Error al inicializar canvas: " + (err?.message || String(err)));
      }
    }).catch((err: any) => {
      if (mounted) setErrorMsg("Error al cargar Fabric.js: " + (err?.message || String(err)));
    });

    return () => {
      mounted = false;
      try { canvasObjRef.current?.dispose(); } catch (_) {}
    };
  }, []);

  const updateSelectedState = (obj: any) => {
    setSelected(obj);
    setScaleVal(getSizePct(obj));
  };

  const loadImageAsBackground = (dataUrl: string) => {
    const fabric = fabricRef.current;
    const canvas = canvasObjRef.current;
    if (!fabric || !canvas) return;
    fabric.Image.fromURL(dataUrl, (img: any) => {
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      img.set({ scaleX: scale, scaleY: scale, left: 0, top: 0, selectable: false, evented: false });
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
      setRoomLoaded(true);
    });
  };


  // Compress a data URL to max ~1024px wide, JPEG quality 0.75 (~200-400KB)
  const compressDataUrl = (dataUrl: string, maxPx = 1024, quality = 0.75): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      useEffect(() => { isAnnotatingRef.current = isAnnotating; }, [isAnnotating]);

  const exportWithAnnotations = (baseDataUrl: string): Promise<string> => {
    if (annotations.length === 0) return Promise.resolve(baseDataUrl);
    return new Promise((resolve) => {
      const overlay = overlayRef.current;
      const divW = overlay?.clientWidth || 1, divH = overlay?.clientHeight || 1;
      const img2 = new Image();
      img2.onload = () => {
        const c = document.createElement("canvas");
        c.width = img2.width; c.height = img2.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img2, 0, 0);
        const sx = img2.width / divW, sy = img2.height / divH;
        annotations.forEach((ann) => {
          const rx = ann.x*sx, ry = ann.y*sy, rw = ann.w*sx, rh = ann.h*sy;
          ctx.fillStyle = "rgba(255,140,0,0.22)";
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = "#FF6B00"; ctx.lineWidth = Math.max(2, sx*2);
          ctx.setLineDash([6,3]); ctx.strokeRect(rx, ry, rw, rh); ctx.setLineDash([]);
          const fs = Math.max(14, Math.round(15*sx));
          ctx.font = "bold " + fs + "px Arial";
          const labelText = "\u2192 " + ann.label;
          const tw = ctx.measureText(labelText).width;
          ctx.fillStyle = "rgba(0,0,0,0.65)";
          ctx.fillRect(rx+2, ry+2, Math.min(rw-4, tw+10), fs+6);
          ctx.fillStyle = "#FFFFFF";
          ctx.fillText(labelText, rx+6, ry+fs+2);
        });
        resolve(c.toDataURL("image/jpeg", 0.92));
      };
      img2.src = baseDataUrl;
    });
  };

  const handleAnnPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isAnnotatingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    annStartRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    setDrawingAnn({ x: e.clientX - r.left, y: e.clientY - r.top, w: 0, h: 0 });
  };

  const handleAnnPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!annStartRef.current || !isAnnotatingRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const s = annStartRef.current;
    setDrawingAnn({ x: Math.min(cx, s.x), y: Math.min(cy, s.y), w: Math.abs(cx-s.x), h: Math.abs(cy-s.y) });
  };

  const handleAnnPointerUp = () => {
    if (!annStartRef.current || !isAnnotatingRef.current) return;
    const ann = drawingAnn;
    annStartRef.current = null; setDrawingAnn(null);
    if (!ann || ann.w < 20 || ann.h < 20) return;
    const label = window.prompt("\u00bfQu\u00e9 va en esta zona?\n(ej: TV aqu\u00ed, Sof\u00e1, No tocar)", "");
    if (!label?.trim()) return;
    setAnnotations((prev) => [...prev, { id: Date.now().toString(), ...ann, label: label.trim() }]);
  };

  img.src = dataUrl;
    });

  const handleRoomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      loadImageAsBackground(dataUrl);
      compressDataUrl(dataUrl).then(setOriginalRoomBase64);
      setRenderedUrl(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Use rendered image as new room base — clears furniture (it's baked into render)
  const handleUseAsBase = () => {
    if (!renderedUrl) return;
    const canvas = canvasObjRef.current;
    // Remove all furniture objects from canvas
    furniture.forEach((item) => {
      if (item.fabricObj && canvas) canvas.remove(item.fabricObj);
    });
    canvas?.renderAll();
    setFurniture([]);
    setSelected(null);
    loadImageAsBackground(renderedUrl);
    compressDataUrl(renderedUrl).then(setOriginalRoomBase64);
    setRenderedUrl(null);
    setRefinementPrompt("");
  };

  const handleReferencePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReferencePhotoBase64(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleFurnitureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricRef.current || !canvasObjRef.current) return;
    e.target.value = "";
    setIsProcessing(true);
    setProcessingMsg("Eliminando fondo...");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/remove-bg", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al eliminar fondo");
      }
      const { image: noBgDataUrl } = await res.json();
      const fabric = fabricRef.current;
      const canvas = canvasObjRef.current;
      const id = `furniture_${Date.now()}`;

      fabric.Image.fromURL(noBgDataUrl, (img: any) => {
        const maxW = canvas.width * 0.35;
        const maxH = canvas.height * 0.5;
        let scale = 1;
        if (img.width > maxW) scale = maxW / img.width;
        if (img.height * scale > maxH) scale = maxH / img.height;

        img.set({
          left: canvas.width / 2 - (img.width * scale) / 2,
          top: canvas.height / 2 - (img.height * scale) / 2,
          scaleX: scale,
          scaleY: scale,
          data: { id, baseScale: scale, sizePercent: 1 },
          cornerColor: "#000000",
          cornerStrokeColor: "#000000",
          borderColor: "#000000",
          cornerSize: 8,
          transparentCorners: false,
        });

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();

        setFurniture((prev) => [
          ...prev,
          { id, name: file.name.replace(/\.[^.]+$/, ""), thumbnail: noBgDataUrl, fabricObj: img },
        ]);
        setSelected(img);
        setScaleVal(100);
        setRenderedUrl(null);
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Error al procesar mueble");
    } finally {
      setIsProcessing(false);
      setProcessingMsg("");
    }
  };

  const selectFurnitureItem = (item: FurnitureItem) => {
    const canvas = canvasObjRef.current;
    if (!canvas || !item.fabricObj) return;
    canvas.setActiveObject(item.fabricObj);
    canvas.renderAll();
    updateSelectedState(item.fabricObj);
  };

  const deleteSelected = () => {
    if (!selected || !canvasObjRef.current) return;
    const id = selected.data?.id;
    canvasObjRef.current.remove(selected);
    canvasObjRef.current.renderAll();
    setSelected(null);
    if (id) setFurniture((prev) => prev.filter((f) => f.id !== id));
    setRenderedUrl(null);
  };

  const applyColor = useCallback((hex: string, alpha: number) => {
    if (!selected || !fabricRef.current || !canvasObjRef.current) return;
    const fabric = fabricRef.current;
    if (alpha === 0) {
      selected.filters = [];
    } else {
      selected.filters = [
        new fabric.Image.filters.BlendColor({ color: hex, mode: "tint", alpha: alpha / 100 }),
      ];
    }
    selected.applyFilters();
    canvasObjRef.current.renderAll();
    setRenderedUrl(null);
  }, [selected]);

  const applyScale = (val: number) => {
    if (!selected || !canvasObjRef.current) return;
    const base = selected.data?.baseScale || 1;
    const sizePct = val / 100;
    selected.set({
      scaleX: sizePct * base,
      scaleY: sizePct * base,
      data: { ...selected.data, sizePercent: sizePct },
    });
    canvasObjRef.current.renderAll();
    setScaleVal(val);
    setRenderedUrl(null);
  };

  const deleteFurnitureById = (id: string) => {
    const canvas = canvasObjRef.current;
    if (!canvas) return;
    const item = furniture.find((f) => f.id === id);
    if (item?.fabricObj) {
      canvas.remove(item.fabricObj);
      canvas.renderAll();
      if (selected?.data?.id === id) setSelected(null);
    }
    setFurniture((prev) => prev.filter((f) => f.id !== id));
    setRenderedUrl(null);
  };

  const flipHorizontal = () => {
    if (!selected || !canvasObjRef.current) return;
    selected.set({ flipX: !selected.flipX });
    canvasObjRef.current.renderAll();
    setRenderedUrl(null);
  };

  const sendToBack = () => {
    if (!selected || !canvasObjRef.current) return;
    canvasObjRef.current.sendToBack(selected);
    canvasObjRef.current.renderAll();
  };
  const bringToFront = () => {
    if (!selected || !canvasObjRef.current) return;
    canvasObjRef.current.bringToFront(selected);
    canvasObjRef.current.renderAll();
  };

  const getCompressedImage = (multiplier: number): string => {
    const canvas = canvasObjRef.current;
    const dataUrl = canvas.toDataURL({ format: "jpeg", quality: 0.92, multiplier });
    const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
    if (sizeKB > 2800) {
      return canvas.toDataURL({ format: "jpeg", quality: 0.75, multiplier: Math.max(1, multiplier - 0.5) });
    }
    return dataUrl;
  };

  const handleRender = async () => {
    if (!canvasObjRef.current || !roomLoaded) return;
    setIsProcessing(true);
    setRenderedUrl(null);
    try {
      setProcessingMsg("Exportando composicion...");
      const rawCanvas = getCompressedImage(1.5);
      const imageBase64 = await exportWithAnnotations(rawCanvas);
      setProcessingMsg("Iniciando render IA...");
      const furnitureContext = furniture
        .filter((f) => f.direction)
        .map((f) => `${f.name}: ${f.direction}`)
        .join(", ");
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          originalRoomBase64: originalRoomBase64 || undefined,
          furnitureContext: furnitureContext || undefined,
          annotationContext: annotations.length > 0 ? annotations.map(a => a.label).join("; ") : undefined,
          selectedStyle,
          referencePhotoBase64,
          initialPrompt: initialPrompt.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al iniciar render");
      }
      const { predictionId, imageUrl: directImageUrl } = await res.json();
      if (directImageUrl) {
        const compressed = await compressDataUrl(directImageUrl, 1200, 0.88);
        setRenderedUrl(compressed);
      } else {
        setProcessingMsg("Procesando con IA...");
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const statusRes = await fetch(`/api/status?id=${predictionId}`);
          const { status, imageUrl, error } = await statusRes.json();
          if (status === "succeeded") { setRenderedUrl(imageUrl); break; }
          if (status === "failed" || status === "canceled") throw new Error(error || "El render fallo");
          setProcessingMsg(`Generando... (${(i + 1) * 3}s)`);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al renderizar");
    } finally {
      setIsProcessing(false);
      setProcessingMsg("");
    }
  };

  const handleRefineRender = async () => {
    if (!renderedUrl || !refinementPrompt.trim()) return;
    setIsProcessing(true);
    const currentRender = renderedUrl;
    setRenderedUrl(null);
    try {
      setProcessingMsg("Refinando render...");
      const compressedRender = await compressDataUrl(currentRender, 1024, 0.85);
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: compressedRender,
          furnitureContext: "",
          selectedStyle,
          referencePhotoBase64,
          refinementPrompt: refinementPrompt.trim(),
          isRefinement: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al refinar render");
      }
      const { predictionId, imageUrl: directImageUrl } = await res.json();
      if (directImageUrl) {
        setRenderedUrl(directImageUrl);
        setRefinementPrompt("");
      } else {
        setProcessingMsg("Refinando con IA...");
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const statusRes = await fetch(`/api/status?id=${predictionId}`);
          const { status, imageUrl, error } = await statusRes.json();
          if (status === "succeeded") { setRenderedUrl(imageUrl); setRefinementPrompt(""); break; }
          if (status === "failed" || status === "canceled") throw new Error(error || "El refinamiento fallo");
          setProcessingMsg(`Refinando... (${(i + 1) * 3}s)`);
        }
      }
    } catch (err: any) {
      setRenderedUrl(currentRender);
      setErrorMsg(err.message || "Error al refinar");
    } finally {
      setIsProcessing(false);
      setProcessingMsg("");
    }
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    const multiplier = exportQuality === "print" ? 4 : exportQuality === "hd" ? 2 : 1;
    if (renderedUrl) {
      link.href = renderedUrl;
      link.download = `staging_${roomName.toLowerCase()}_render.jpg`;
    } else if (canvasObjRef.current) {
      link.href = canvasObjRef.current.toDataURL({ format: "jpeg", quality: 0.95, multiplier });
      link.download = `staging_${roomName.toLowerCase()}_${exportQuality}.jpg`;
    }
    link.click();
  };

  const styleLabel = selectedStyle ? STYLES.find((s) => s.id === selectedStyle)?.label : null;

  return (
    <div className="flex flex-col h-screen bg-stone-100 text-stone-900 overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <header className="flex items-center justify-between px-8 py-3 bg-white border-b border-stone-200 flex-shrink-0">
        <span className="text-[11px] font-semibold tracking-[0.3em] uppercase text-stone-900">
          Home Staging Studio
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[9px] tracking-[0.25em] uppercase text-stone-400">Estancia</span>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="border-b border-stone-300 focus:border-stone-900 bg-transparent text-[11px] text-stone-900 px-0 py-0.5 w-20 outline-none transition-colors tracking-wide"
          />
        </div>
      </header>

      {errorMsg && (
        <div className="flex items-center justify-between px-6 py-2 bg-stone-900 text-white text-[11px] flex-shrink-0">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-4 opacity-50 hover:opacity-100 transition-opacity">x</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* Left Sidebar */}
        <aside className="w-64 bg-white border-r border-stone-200 flex flex-col overflow-y-auto flex-shrink-0">
          <div className="p-5 space-y-7">

            {/* Room photo */}
            <section>
              <p className="text-[9px] font-semibold tracking-[0.25em] uppercase text-stone-400 mb-3">Habitacion</p>
              <button
                onClick={() => roomInputRef.current?.click()}
                className={`w-full border py-4 text-center transition-all text-[10px] tracking-[0.2em] uppercase ${
                  roomLoaded
                    ? "border-stone-900 text-stone-900"
                    : "border-stone-200 text-stone-400 hover:border-stone-400 hover:text-stone-600"
                }`}
              >
                {roomLoaded ? "Foto cargada" : "Subir foto"}
              </button>
              <input ref={roomInputRef} type="file" accept="image/*" className="hidden" onChange={handleRoomUpload} />
            <button
              onClick={() => setIsAnnotating((v) => !v)}
              disabled={!roomLoaded}
              className={`w-full mt-2 border py-3 text-center text-[10px] tracking-[0.2em] uppercase transition-all ${isAnnotating ? "border-orange-400 bg-orange-50 text-orange-700" : "border-stone-200 hover:border-stone-400 text-stone-500"}`}>
              {isAnnotating ? "\u2713 Dibujando zonas..." : "\u270f Anotar zona"}
            </button>
            {annotations.length > 0 && (
              <div className="mt-2 space-y-1">
                {annotations.map((ann) => (
                  <div key={ann.id} className="flex items-center justify-between border border-orange-200 bg-orange-50 px-2 py-1 text-[10px]">
                    <span className="text-orange-700 truncate">&#8594; {ann.label}</span>
                    <button onClick={() => setAnnotations((prev) => prev.filter((a) => a.id !== ann.id))}
                      className="text-stone-400 hover:text-red-500 ml-2 flex-shrink-0">&#x2715;</button>
                  </div>
                ))}
                <button onClick={() => setAnnotations([])} className="text-[9px] text-stone-400 hover:text-red-500 tracking-wider uppercase w-full text-center mt-1">
                  Borrar todas</button>
              </div>
            )}
            </section>

            {/* Style suggestions */}
            <section>
              <p className="text-[9px] font-semibold tracking-[0.25em] uppercase text-stone-400 mb-3">Estilo</p>
              <button
                onClick={() => setShowStylePanel((v) => !v)}
                className={`w-full border py-3 text-center text-[10px] tracking-[0.2em] uppercase transition-all ${
                  selectedStyle
                    ? "border-stone-900 text-stone-900"
                    : "border-stone-200 text-stone-400 hover:border-stone-400 hover:text-stone-600"
                }`}
              >
                {styleLabel ? styleLabel : "Elegir estilo"}
              </button>

              {showStylePanel && (
                <div className="mt-2 border border-stone-100 bg-stone-50">
                  <div className="grid grid-cols-2 gap-px bg-stone-100">
                    {STYLES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedStyle(selectedStyle === s.id ? null : s.id);
                          setShowStylePanel(false);
                        }}
                        className={`bg-white p-2.5 text-left transition-all ${
                          selectedStyle === s.id ? "bg-stone-900 text-white" : "hover:bg-stone-50"
                        }`}
                      >
                        <div className={`text-[10px] font-medium tracking-wide ${selectedStyle === s.id ? "text-white" : "text-stone-800"}`}>
                          {s.label}
                        </div>
                        <div className={`text-[8px] mt-0.5 leading-tight ${selectedStyle === s.id ? "text-stone-300" : "text-stone-400"}`}>
                          {s.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedStyle && (
                    <button
                      onClick={() => { setSelectedStyle(null); setShowStylePanel(false); }}
                      className="w-full py-2 text-[9px] tracking-[0.2em] uppercase text-stone-400 hover:text-stone-700 transition-colors"
                    >
                      Quitar estilo
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Reference / inspiration photo */}
            <section>
              <p className="text-[9px] font-semibold tracking-[0.25em] uppercase text-stone-400 mb-3">Foto referencia</p>
              {referencePhotoBase64 ? (
                <div className="relative">
                  <img src={referencePhotoBase64} alt="Referencia" className="w-full h-24 object-cover border border-stone-200" />
                  <button
                    onClick={() => setReferencePhotoBase64(null)}
                    className="absolute top-1 right-1 bg-white/90 text-stone-500 hover:text-stone-900 text-[10px] w-5 h-5 flex items-center justify-center border border-stone-200 transition-colors"
                  >
                    x
                  </button>
                  <p className="text-[8px] text-stone-400 mt-1 tracking-wider">La IA imitará este estilo</p>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => referenceInputRef.current?.click()}
                    className="w-full border border-dashed border-stone-200 py-3 text-center text-[10px] tracking-[0.2em] uppercase text-stone-400 hover:border-stone-400 hover:text-stone-600 transition-all"
                  >
                    + Subir inspiracion
                  </button>
                  <p className="text-[8px] text-stone-400 mt-1.5 tracking-wider">Foto de decoración que te guste</p>
                </>
              )}
              <input ref={referenceInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferencePhotoUpload} />
            </section>

            {/* Initial prompt */}
            <section>
              <p className="text-[9px] font-semibold tracking-[0.25em] uppercase text-stone-400 mb-3">Descripcion / Prompt</p>
              <textarea
                rows={3}
                placeholder="ej. habitacion luminosa con sofá gris, paredes blancas, estilo nórdico..."
                value={initialPrompt}
                onChange={(e) => setInitialPrompt(e.target.value)}
                className="w-full border border-stone-200 focus:border-stone-900 bg-transparent text-[11px] text-stone-900 p-2 outline-none transition-colors placeholder-stone-300 resize-none leading-relaxed"
              />
              <p className="text-[8px] text-stone-400 mt-1 tracking-wider">La IA tomará esto en cuenta al renderizar</p>
            </section>

            {/* Furniture */}
            <section>
              <p className="text-[9px] font-semibold tracking-[0.25em] uppercase text-stone-400 mb-3">Muebles</p>
              <button
                onClick={() => furnitureInputRef.current?.click()}
                disabled={!isReady}
                className="w-full border border-stone-200 py-3 text-center text-[10px] tracking-[0.2em] uppercase text-stone-400 hover:border-stone-400 hover:text-stone-600 transition-all disabled:opacity-30"
              >
                + Anadir mueble
              </button>
              <input ref={furnitureInputRef} type="file" accept="image/*" className="hidden" onChange={handleFurnitureUpload} />

              {furniture.length > 0 && (
                <div className="mt-3 space-y-px">
                  {furniture.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 border transition-all ${
                        selected?.data?.id === item.id
                          ? "border-stone-900 bg-stone-50"
                          : "border-transparent hover:border-stone-200"
                      }`}
                    >
                      <button
                        onClick={() => selectFurnitureItem(item)}
                        className="flex items-center gap-3 p-2.5 text-left flex-1 min-w-0"
                      >
                        <img src={item.thumbnail} alt={item.name} className="w-9 h-9 object-contain flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] text-stone-700 truncate block">{item.name}</span>
                          {item.direction && (
                            <span className="text-[9px] text-stone-400 truncate block">{item.direction}</span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => deleteFurnitureById(item.id)}
                        className="pr-2.5 text-stone-300 hover:text-stone-700 transition-colors text-[14px] flex-shrink-0"
                        title="Eliminar"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Controls */}
            {selected && (
              <section className="border-t border-stone-100 pt-6 space-y-5">
                <p className="text-[9px] font-semibold tracking-[0.25em] uppercase text-stone-400">Ajustes</p>

                {/* Scale */}
                <div>
                  <div className="flex justify-between text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-2">
                    <span>Tamano</span><span>{scaleVal}%</span>
                  </div>
                  <input
                    type="range" min={20} max={300} value={scaleVal}
                    onChange={(e) => applyScale(Number(e.target.value))}
                    className="w-full accent-stone-900"
                  />
                </div>

                {/* Color tint */}
                <div>
                  <div className="flex justify-between text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-2">
                    <span>Tinte</span><span>{colorAlpha}%</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color" value={color}
                      onChange={(e) => { setColor(e.target.value); if (colorAlpha > 0) applyColor(e.target.value, colorAlpha); }}
                      className="h-6 w-9 cursor-pointer border border-stone-200 bg-transparent p-0.5"
                    />
                    <input
                      type="range" min={0} max={80} value={colorAlpha}
                      onChange={(e) => { const v = Number(e.target.value); setColorAlpha(v); applyColor(color, v); }}
                      className="flex-1 accent-stone-900"
                    />
                    {colorAlpha > 0 && (
                      <button onClick={() => { setColorAlpha(0); applyColor(color, 0); }} className="text-[9px] text-stone-400 hover:text-stone-900 transition-colors">x</button>
                    )}
                  </div>
                </div>

                {/* Direction note */}
                <div>
                  <div className="text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-2">Nota de direccion</div>
                  <input
                    type="text"
                    placeholder="ej. mira hacia la TV"
                    value={furniture.find((f) => f.fabricObj === selected)?.direction ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFurniture((prev) =>
                        prev.map((f) => (f.fabricObj === selected ? { ...f, direction: val } : f))
                      );
                    }}
                    className="w-full border-b border-stone-200 focus:border-stone-900 bg-transparent text-[11px] text-stone-900 py-1 outline-none transition-colors placeholder-stone-300"
                  />
                </div>

                {/* Quick actions */}
                <div className="grid grid-cols-3 gap-1">
                  <button onClick={flipHorizontal} className="text-[9px] border border-stone-200 hover:border-stone-500 py-2 text-stone-500 tracking-wider uppercase transition-all">Voltear</button>
                  <button onClick={sendToBack}    className="text-[9px] border border-stone-200 hover:border-stone-500 py-2 text-stone-500 tracking-wider uppercase transition-all">Fondo</button>
                  <button onClick={bringToFront}  className="text-[9px] border border-stone-200 hover:border-stone-500 py-2 text-stone-500 tracking-wider uppercase transition-all">Frente</button>
                </div>

                {/* Delete */}
                <button
                  onClick={deleteSelected}
                  className="w-full py-2 border border-stone-200 hover:border-stone-900 hover:bg-stone-900 hover:text-white text-stone-400 text-[9px] tracking-[0.25em] uppercase transition-all"
                >
                  Eliminar
                </button>
              </section>
            )}
          </div>

          {/* Bottom actions */}
          <div className="mt-auto p-5 space-y-3 border-t border-stone-100">
            <div>
              <p className="text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-2">Exportar</p>
              <select
                value={exportQuality}
                onChange={(e) => setExportQuality(e.target.value as "web" | "hd" | "print")}
                className="w-full border border-stone-200 bg-white text-[11px] text-stone-700 py-2 px-2 focus:border-stone-900 outline-none transition-colors"
              >
                <option value="web">Web (1x)</option>
                <option value="hd">HD (2x)</option>
                <option value="print">Impresion (4x)</option>
              </select>
            </div>

            <button
              onClick={handleRender}
              disabled={!roomLoaded || isProcessing}
              className="w-full py-3 bg-stone-900 hover:bg-stone-700 disabled:bg-stone-200 disabled:text-stone-400 text-white text-[10px] tracking-[0.3em] uppercase transition-colors"
            >
              {isProcessing ? processingMsg : "Renderizar"}
            </button>

            <button
              onClick={handleDownload}
              disabled={!roomLoaded && !renderedUrl}
              className="w-full py-2.5 border border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white disabled:border-stone-200 disabled:text-stone-300 text-[10px] tracking-[0.25em] uppercase transition-all"
            >
              Descargar
            </button>
          </div>
        </aside>

        {/* Canvas / Render area */}
        <main className="flex-1 flex items-center justify-center bg-stone-100 overflow-hidden p-8">

          {/* Canvas — always in DOM to preserve Fabric state */}
          <div className={`relative ${renderedUrl ? "hidden" : ""}`}>
            <div ref={canvasRef} className="shadow-sm overflow-hidden" />
            {roomLoaded && (
              <div ref={overlayRef} className="absolute inset-0"
                style={{ cursor: isAnnotating ? "crosshair" : "default", pointerEvents: isAnnotating ? "auto" : "none" }}
                onPointerDown={handleAnnPointerDown}
                onPointerMove={handleAnnPointerMove}
                onPointerUp={handleAnnPointerUp}>
                <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
                  {annotations.map((ann) => (
                    <g key={ann.id}>
                      <rect x={ann.x} y={ann.y} width={ann.w} height={ann.h}
                        fill="rgba(255,140,0,0.18)" stroke="#FF6B00" strokeWidth="2" strokeDasharray="6 3" />
                      <rect x={ann.x+2} y={ann.y+2} width={Math.min(ann.w-4, ann.label.length*8+14)} height="22"
                        fill="rgba(0,0,0,0.6)" rx="2" />
                      <text x={ann.x+7} y={ann.y+16} fill="white" fontSize="12" fontWeight="bold">&#8594; {ann.label}</text>
                    </g>
                  ))}
                  {drawingAnn && (
                    <rect x={drawingAnn.x} y={drawingAnn.y} width={drawingAnn.w} height={drawingAnn.h}
                      fill="rgba(255,140,0,0.12)" stroke="#FF6B00" strokeWidth="2" strokeDasharray="5 3" />
                  )}
                </svg>
              </div>
            )}
            {!roomLoaded && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-stone-300">
                  <p className="text-[11px] tracking-[0.3em] uppercase">Sube una foto</p>
                  <p className="text-[10px] mt-1 tracking-[0.2em]">de la habitacion vacia</p>
                </div>
              </div>
            )}
          </div>

          {/* Rendered result */}
          {renderedUrl && (
            <div className="flex flex-col items-center gap-4 max-w-full max-h-full">
              <div className="relative">
                <img
                  src={renderedUrl}
                  alt="Render fotorrealista"
                  className="max-w-full max-h-[calc(100vh-260px)] object-contain shadow-sm"
                />
                <div className="absolute top-3 left-3 bg-white/90 px-3 py-1.5 text-[9px] text-stone-700 tracking-[0.25em] uppercase">
                  Render completado
                </div>
              </div>

              {/* Refinement prompt */}
              <div className="flex gap-2 w-full max-w-xl">
                <input
                  type="text"
                  placeholder="Ajusta el render: ej. más luz natural, pared más oscura..."
                  value={refinementPrompt}
                  onChange={(e) => setRefinementPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && refinementPrompt.trim()) handleRefineRender(); }}
                  className="flex-1 border-b border-stone-300 focus:border-stone-900 bg-transparent text-[11px] text-stone-900 py-2 outline-none transition-colors placeholder-stone-300"
                />
                <button
                  onClick={handleRefineRender}
                  disabled={!refinementPrompt.trim() || isProcessing}
                  className="px-4 py-2 bg-stone-700 text-white text-[9px] tracking-[0.2em] uppercase hover:bg-stone-900 disabled:bg-stone-200 disabled:text-stone-400 transition-colors flex-shrink-0"
                >
                  Refinar
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleUseAsBase}
                  className="px-5 py-2.5 bg-stone-900 text-white text-[10px] tracking-[0.25em] uppercase hover:bg-stone-700 transition-colors"
                >
                  Continuar desde aqui
                </button>
                <button
                  onClick={() => setRenderedUrl(null)}
                  className="px-5 py-2.5 border border-stone-400 text-stone-600 text-[10px] tracking-[0.25em] uppercase hover:border-stone-900 hover:text-stone-900 transition-all"
                >
                  Volver al editor
                </button>
              </div>

              <p className="text-[9px] text-stone-400 tracking-[0.2em] uppercase text-center">
                Continuar carga el render como base y limpia los muebles del canvas
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white border border-stone-200 p-10 text-center max-w-xs shadow-sm">
             <div className="w-6 h-6 border border-stone-300 border-t-stone-900 rounded-full animate-spin mx-auto mb-4" />
             <p className="text-[10px] font-semibold tracking-[0.25em] uppercase text-stone-900 mb-2">
               Renderizando
             </p>
             <p className="text-[9px] text-stone-400 tracking-wider">{processingMsg}</p>
           </div>
         </div>
       )}
     </div>
  );
}
