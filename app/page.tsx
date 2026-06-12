/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface FurnitureItem {
  id: string;
  name: string;
  thumbnail: string;
  fabricObj: any;
}

export default function HomePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const canvasObjRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [color, setColor] = useState("#FFFFFF");
  const [colorAlpha, setColorAlpha] = useState(0);
  const [scaleVal, setScaleVal] = useState(100);
  const [rotateVal, setRotateVal] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportQuality, setExportQuality] = useState<"web" | "hd" | "print">("hd");
  const [roomName, setRoomName] = useState("Sala");
  const roomInputRef = useRef<HTMLInputElement>(null);
  const furnitureInputRef = useRef<HTMLInputElement>(null);

  // Init Fabric.js
  useEffect(() => {
    let mounted = true;
    import("fabric").then((mod) => {
      if (!mounted) return;
      const fabric = (mod as any).fabric || mod;
      fabricRef.current = fabric;

      const canvas = new fabric.Canvas(canvasRef.current, {
        width: 880,
        height: 580,
        backgroundColor: "#111118",
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
      canvas.on("selection:cleared", () => {
        setSelected(null);
      });
      canvas.on("object:scaling", (e: any) => {
        if (e.target) {
          const s = Math.round(((e.target.scaleX || 1) / (e.target.data?.baseScale || 1)) * 100);
          setScaleVal(s);
        }
      });
      canvas.on("object:rotating", (e: any) => {
        if (e.target) setRotateVal(Math.round(e.target.angle || 0));
      });

      setIsReady(true);
    });

    return () => {
      mounted = false;
      try { canvasObjRef.current?.dispose(); } catch (_) { /* ignore cleanup errors */ }
    };
  }, []);

  const updateSelectedState = (obj: any) => {
    setSelected(obj);
    setScaleVal(Math.round(((obj.scaleX || 1) / (obj.data?.baseScale || 1)) * 100));
    setRotateVal(Math.round(obj.angle || 0));
  };

  // Upload room photo
  const handleRoomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricRef.current || !canvasObjRef.current) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const fabric = fabricRef.current;
      const canvas = canvasObjRef.current;

      fabric.Image.fromURL(dataUrl, (img: any) => {
        const scaleX = canvas.width / img.width;
        const scaleY = canvas.height / img.height;
        const scale = Math.min(scaleX, scaleY);
        img.set({ scaleX: scale, scaleY: scale, left: 0, top: 0, selectable: false, evented: false });
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        setRoomLoaded(true);
        setRenderedUrl(null);
      });
    };
    reader.readAsDataURL(file);
  };

  // Upload furniture → remove bg → add to canvas
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
          data: { id, baseScale: scale },
          cornerColor: "#3b82f6",
          cornerStrokeColor: "#1d4ed8",
          borderColor: "#3b82f6",
          cornerSize: 10,
          transparentCorners: false,
        });

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();

        setFurniture((prev) => [...prev, { id, name: file.name.replace(/\.[^.]+$/, ""), thumbnail: noBgDataUrl, fabricObj: img }]);
        setSelected(img);
        setScaleVal(100);
        setRotateVal(0);
        setRenderedUrl(null);
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Error al procesar mueble");
    } finally {
      setIsProcessing(false);
      setProcessingMsg("");
    }
  };

  // Select a furniture item from the list
  const selectFurnitureItem = (item: FurnitureItem) => {
    const canvas = canvasObjRef.current;
    if (!canvas || !item.fabricObj) return;
    canvas.setActiveObject(item.fabricObj);
    canvas.renderAll();
    updateSelectedState(item.fabricObj);
  };

  // Delete selected object
  const deleteSelected = () => {
    if (!selected || !canvasObjRef.current) return;
    const id = selected.data?.id;
    canvasObjRef.current.remove(selected);
    canvasObjRef.current.renderAll();
    setSelected(null);
    if (id) setFurniture((prev) => prev.filter((f) => f.id !== id));
    setRenderedUrl(null);
  };

  // Apply color tint
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

  // Scale selected object
  const applyScale = (val: number) => {
    if (!selected || !canvasObjRef.current) return;
    const baseScale = selected.data?.baseScale || 1;
    const newScale = (val / 100) * baseScale;
    selected.set({ scaleX: newScale, scaleY: newScale });
    canvasObjRef.current.renderAll();
    setScaleVal(val);
    setRenderedUrl(null);
  };

  // Rotate selected object
  const applyRotate = (val: number) => {
    if (!selected || !canvasObjRef.current) return;
    selected.set({ angle: val });
    canvasObjRef.current.renderAll();
    setRotateVal(val);
    setRenderedUrl(null);
  };

  // Flip horizontal
  const flipHorizontal = () => {
    if (!selected || !canvasObjRef.current) return;
    selected.set({ flipX: !selected.flipX });
    canvasObjRef.current.renderAll();
    setRenderedUrl(null);
  };

  // Send to back / bring to front
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

  // Compress canvas image for API
  const getCompressedImage = (multiplier: number): string => {
    const canvas = canvasObjRef.current;
    const dataUrl = canvas.toDataURL({ format: "jpeg", quality: 0.92, multiplier });
    // Compress to max ~3MB
    const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
    if (sizeKB > 2800) {
      return canvas.toDataURL({ format: "jpeg", quality: 0.75, multiplier: Math.max(1, multiplier - 0.5) });
    }
    return dataUrl;
  };

  // Render with AI
  const handleRender = async () => {
    if (!canvasObjRef.current || !roomLoaded) return;
    setIsProcessing(true);
    setRenderedUrl(null);

    try {
      setProcessingMsg("Exportando composición...");
      const imageBase64 = getCompressedImage(1.5);

      setProcessingMsg("Iniciando render IA...");
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al iniciar render");
      }
      const { predictionId } = await res.json();

      setProcessingMsg("Procesando con IA...");
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await fetch(`/api/status?id=${predictionId}`);
        const { status, imageUrl, error } = await statusRes.json();
        if (status === "succeeded") {
          setRenderedUrl(imageUrl);
          break;
        }
        if (status === "failed" || status === "canceled") {
          throw new Error(error || "El render falló");
        }
        setProcessingMsg(`Generando... (${(i + 1) * 3}s)`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al renderizar");
    } finally {
      setIsProcessing(false);
      setProcessingMsg("");
    }
  };

  // Download
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

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">🏠</span>
          <h1 className="font-semibold text-white text-base">Home Staging AI</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Estancia:</span>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white w-28"
          />
        </div>
      </header>

      {errorMsg && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-900/80 border-b border-red-700 text-red-200 text-sm flex-shrink-0">
          <span>⚠ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-4 text-red-300 hover:text-white font-bold">✕</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto flex-shrink-0">
          <div className="p-3 space-y-4">

            {/* Room photo */}
            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Foto de la habitación</p>
              <button
                onClick={() => roomInputRef.current?.click()}
                className={`w-full border-2 border-dashed rounded-lg p-3 text-center transition-colors ${
                  roomLoaded ? "border-green-600 bg-green-900/20" : "border-gray-600 hover:border-blue-500"
                }`}
              >
                {roomLoaded ? (
                  <div className="text-green-400 text-sm">✓ Foto cargada<br /><span className="text-gray-400 text-xs">Clic para cambiar</span></div>
                ) : (
                  <div className="text-gray-400 text-sm">
                    <div className="text-2xl mb-1">📷</div>
                    <div>Subir foto vacía</div>
                  </div>
                )}
              </button>
              <input ref={roomInputRef} type="file" accept="image/*" className="hidden" onChange={handleRoomUpload} />
            </section>

            {/* Furniture */}
            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Muebles y adornos</p>
              <button
                onClick={() => furnitureInputRef.current?.click()}
                disabled={!isReady}
                className="w-full border-2 border-dashed border-gray-600 rounded-lg p-2 text-center hover:border-green-500 transition-colors disabled:opacity-50"
              >
                <div className="text-gray-400 text-sm">
                  <span className="text-lg">🪑</span>
                  <div className="text-xs mt-1">+ Añadir mueble</div>
                </div>
              </button>
              <input ref={furnitureInputRef} type="file" accept="image/*" className="hidden" onChange={handleFurnitureUpload} />

              {furniture.length > 0 && (
                <div className="mt-2 space-y-1">
                  {furniture.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectFurnitureItem(item)}
                      className={`w-full flex items-center gap-2 rounded-lg p-2 transition-colors text-left ${
                        selected?.data?.id === item.id ? "bg-blue-900/50 border border-blue-600" : "bg-gray-800 hover:bg-gray-700"
                      }`}
                    >
                      <img src={item.thumbnail} alt={item.name} className="w-8 h-8 object-contain flex-shrink-0" />
                      <span className="text-xs text-gray-300 truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Controls for selected item */}
            {selected && (
              <section className="border-t border-gray-700 pt-3 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ajustes</p>

                {/* Scale */}
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Tamaño</span><span>{scaleVal}%</span>
                  </div>
                  <input
                    type="range" min={20} max={300} value={scaleVal}
                    onChange={(e) => applyScale(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                {/* Rotate */}
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Rotación</span><span>{rotateVal}°</span>
                  </div>
                  <input
                    type="range" min={-180} max={180} value={rotateVal}
                    onChange={(e) => applyRotate(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                {/* Color */}
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Color / Tinte</span><span>{colorAlpha}%</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color" value={color}
                      onChange={(e) => { setColor(e.target.value); if (colorAlpha > 0) applyColor(e.target.value, colorAlpha); }}
                      className="h-8 w-10 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <input
                      type="range" min={0} max={80} value={colorAlpha}
                      onChange={(e) => { const v = Number(e.target.value); setColorAlpha(v); applyColor(color, v); }}
                      className="flex-1 accent-blue-500"
                    />
                    {colorAlpha > 0 && (
                      <button
                        onClick={() => { setColorAlpha(0); applyColor(color, 0); }}
                        className="text-xs text-gray-400 hover:text-white"
                        title="Quitar color"
                      >✕</button>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex flex-wrap gap-1">
                  <button onClick={flipHorizontal} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded">↔ Voltear</button>
                  <button onClick={sendToBack} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded">⬇ Al fondo</button>
                  <button onClick={bringToFront} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded">⬆ Al frente</button>
                </div>

                {/* Delete */}
                <button
                  onClick={deleteSelected}
                  className="w-full py-1.5 bg-red-900/50 hover:bg-red-800/70 text-red-300 rounded text-xs transition-colors"
                >
                  🗑 Eliminar elemento
                </button>
              </section>
            )}
          </div>

          {/* Bottom actions */}
          <div className="mt-auto p-3 space-y-2 border-t border-gray-800">
            <div>
              <p className="text-xs text-gray-400 mb-1">Calidad de exportación</p>
              <select
                value={exportQuality}
                onChange={(e) => setExportQuality(e.target.value as any)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
              >
                <option value="web">Web (1x)</option>
                <option value="hd">HD (2x)</option>
                <option value="print">Impresión (4x)</option>
              </select>
            </div>

            <button
              onClick={handleRender}
              disabled={!roomLoaded || isProcessing}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-semibold text-sm transition-colors"
            >
              {isProcessing ? "⏳ " + processingMsg : "✨ Renderizar"}
            </button>

            <button
              onClick={handleDownload}
              disabled={!roomLoaded && !renderedUrl}
              className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm transition-colors"
            >
              ⬇ Descargar imagen
            </button>

            {renderedUrl && (
              <button
                onClick={() => setRenderedUrl(null)}
                className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors"
              >
                ← Volver al editor
              </button>
            )}
          </div>
        </aside>

        {/* Canvas area */}
        <main className="flex-1 flex items-center justify-center bg-gray-950 overflow-hidden p-4">
          {renderedUrl ? (
            <div className="relative max-w-full max-h-full">
              <img
                src={renderedUrl}
                alt="Render fotorrealista"
                className="max-w-full max-h-[calc(100vh-120px)] rounded-xl shadow-2xl object-contain"
              />
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur rounded-lg px-3 py-1.5 text-xs text-green-400 font-semibold">
                ✓ Render completado
              </div>
            </div>
          ) : (
            <div className="relative">
              <canvas ref={canvasRef} className="rounded-xl shadow-2xl" />
              {!roomLoaded && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-gray-600">
                    <div className="text-6xl mb-3">🏠</div>
                    <p className="text-base font-medium">Sube una foto de la habitación vacía</p>
                    <p className="text-sm mt-1 text-gray-700">Luego añade muebles desde el panel izquierdo</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center max-w-xs shadow-2xl">
            <div className="text-4xl mb-4 animate-pulse">✨</div>
            <p className="text-white font-semibold text-base">{processingMsg}</p>
            <p className="text-gray-400 text-sm mt-2">Por favor espera...</p>
          </div>
        </div>
      )}
    </div>
  );
}
