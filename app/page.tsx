"use client";

import { useState, useRef, useCallback } from "react";

type Step = "idle" | "loading" | "done" | "error";

interface GenerateResult {
  imageUrl: string;
  promptUsed: string;
}

function compressImage(file: File, maxWidth = 1024, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function UploadZone({
  label,
  accept,
  preview,
  onFile,
}: {
  label: string;
  accept: string;
  preview: string | null;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="relative flex flex-col items-center justify-center w-full rounded-2xl border-2 border-dashed border-white/20 bg-white/5 cursor-pointer hover:border-white/40 hover:bg-white/10 transition-all overflow-hidden"
      style={{ minHeight: preview ? "auto" : "13rem" }}
    >
      {preview ? (
        <img
          src={preview}
          alt="preview"
          className="w-full h-auto max-h-72 object-contain p-2"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-white/50 select-none py-10">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs">Arrastra o haz clic</span>
        </div>
      )}
      {preview && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
          <span className="text-sm font-medium text-white">Cambiar imagen</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

export default function Home() {
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreview, setRoomPreview] = useState<string | null>(null);
  const [furnitureFile, setFurnitureFile] = useState<File | null>(null);
  const [furniturePreview, setFurniturePreview] = useState<string | null>(null);
  const [furnitureUrl, setFurnitureUrl] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState("");

  const handleRoomFile = (file: File) => {
    setRoomFile(file);
    setRoomPreview(URL.createObjectURL(file));
  };

  const handleFurnitureFile = (file: File) => {
    setFurnitureFile(file);
    setFurniturePreview(URL.createObjectURL(file));
    setFurnitureUrl("");
  };

  const pollForResult = async (predictionId: string): Promise<string> => {
    const messages = [
      "Iniciando modelo de IA...",
      "Procesando imagen...",
      "Generando render...",
      "Casi listo...",
    ];
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const idx = i < 3 ? 0 : i < 8 ? 1 : i < 15 ? 2 : 3;
      setLoadingStatus(messages[idx]);
      const res = await fetch(`/api/status?id=${predictionId}`);
      const data = await res.json();
      if (data.status === "succeeded") return data.imageUrl;
      if (data.status === "failed") throw new Error(data.error ?? "La generacion fallo");
    }
    throw new Error("Tiempo de espera agotado (2 min)");
  };

  const generate = async () => {
    if (!roomFile) { setError("Sube una foto de tu habitacion primero."); return; }
    if (!furnitureFile && !furnitureUrl.trim()) { setError("Sube una imagen del mueble o pega su URL."); return; }

    setStep("loading");
    setError(null);
    setResult(null);
    setLoadingStatus("Preparando imagenes...");

    try {
      const roomBase64 = await compressImage(roomFile, 1024, 0.8);
      const furnitureBase64 = furnitureFile ? await compressImage(furnitureFile, 768, 0.8) : null;

      setLoadingStatus("Enviando al servidor...");
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomBase64,
          furnitureBase64,
          furnitureUrl: furnitureUrl.trim() || null,
          userPrompt: userPrompt.trim() || "Place the furniture naturally in the room",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");

      setLoadingStatus("Iniciando modelo de IA...");
      const imageUrl = await pollForResult(data.predictionId);
      setResult({ imageUrl, promptUsed: data.promptUsed ?? "" });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setStep("error");
    } finally {
      setLoadingStatus("");
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12 gap-10">
      <header className="text-center max-w-xl">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Interior AI</h1>
        <p className="text-white/50 text-sm leading-relaxed">
          Sube una foto de tu habitacion, elige un mueble y visualiza como quedaria.
        </p>
      </header>

      <div className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <Label number={1} text="Foto de tu habitacion" />
          <UploadZone label="Sube la foto de tu habitacion" accept="image/*" preview={roomPreview} onFile={handleRoomFile} />
        </section>

        <section className="flex flex-col gap-2">
          <Label number={2} text="El mueble que quieres visualizar" />
          <UploadZone label="Sube la imagen del mueble" accept="image/*" preview={furniturePreview} onFile={handleFurnitureFile} />
          <div className="flex items-center gap-3 my-1">
            <hr className="flex-1 border-white/10" />
            <span className="text-xs text-white/30">o pega un link</span>
            <hr className="flex-1 border-white/10" />
          </div>
          <input
            type="url"
            value={furnitureUrl}
            onChange={(e) => { setFurnitureUrl(e.target.value); if (e.target.value) { setFurnitureFile(null); setFurniturePreview(null); } }}
            placeholder="https://tienda.com/sofa.jpg"
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/40 transition"
          />
        </section>

        <section className="flex flex-col gap-2">
          <Label number={3} text="Describe como colocarlo (opcional)" />
          <input
            type="text"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="Ej: Pon el sofa verde contra la pared izquierda"
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/40 transition"
          />
        </section>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
        )}

        <button
          onClick={generate}
          disabled={step === "loading"}
          className="w-full py-3.5 rounded-xl font-semibold text-sm bg-white text-black hover:bg-white/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {step === "loading" ? (
            <><Spinner />{loadingStatus || "Generando..."}</>
          ) : (
            "✨ Generar Render"
          )}
        </button>
      </div>

      {result && (
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Resultado</h2>
          <img src={result.imageUrl} alt="Render generado" className="w-full h-auto rounded-2xl border border-white/10" />
          <details className="text-xs text-white/30">
            <summary className="cursor-pointer hover:text-white/50">Ver prompt utilizado</summary>
            <p className="mt-2 font-mono whitespace-pre-wrap">{result.promptUsed}</p>
          </details>
          <div className="flex gap-3">
            <a href={result.imageUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-center border border-white/20 hover:bg-white/5 transition">
              Descargar imagen
            </a>
            <button onClick={() => { setStep("idle"); setResult(null); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-white/20 hover:bg-white/5 transition">
              Nuevo render
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Label({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 h-5 rounded-full bg-white/10 text-white/60 text-xs flex items-center justify-center font-bold">{number}</span>
      <span className="text-sm font-medium text-white/80">{text}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
