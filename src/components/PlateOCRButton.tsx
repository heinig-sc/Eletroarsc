import React, { useState, useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface PlateOCRButtonProps {
  onPlateDetected: (plate: string) => void;
  className?: string;
}

export default function PlateOCRButton({ onPlateDetected, className = "" }: PlateOCRButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const base64Data = await fileToBase64(file);
      const plate = await performOCR(base64Data, file.type);
      if (plate) {
        onPlateDetected(plate);
      } else {
        alert("Não foi possível identificar a placa na imagem. Tente aproximar mais ou melhorar a iluminação.");
      }
    } catch (error) {
      console.error("OCR Error:", error);
      alert("Erro ao processar imagem. Tente novamente.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64String = result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const performOCR = async (base64Image: string, mimeType: string): Promise<string | null> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'undefined') {
      console.error("GEMINI_API_KEY not found or undefined. Make sure it is set in your environment variables.");
      alert("Erro de configuração: Chave da API Gemini não encontrada. Verifique as variáveis de ambiente.");
      return null;
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = "gemini-3-flash-preview";

    const prompt = "Analise esta imagem e identifique a placa do veículo (padrão brasileiro ou Mercosul). Retorne APENAS os caracteres da placa (ex: ABC-1234 ou ABC1D23). Não inclua nenhum outro texto ou explicação. Se não encontrar uma placa, retorne 'NOT_FOUND'.";

    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: base64Image,
              },
            },
          ],
        },
      });

      const text = response.text?.trim();
      console.log("OCR Raw Response:", text);

      if (text && text.toUpperCase() !== 'NOT_FOUND') {
        // Basic cleanup: remove everything except alphanumeric and hyphens
        const cleaned = text.replace(/[^A-Z0-9-]/g, '').toUpperCase();
        
        if (!cleaned) return null;

        // Regex for standard (AAA-9999) and Mercosul (AAA9A99)
        const standardRegex = /[A-Z]{3}-?[0-9]{4}/;
        const mercosulRegex = /[A-Z]{3}[0-9][A-Z][0-9]{2}/;
        
        const match = cleaned.match(standardRegex) || cleaned.match(mercosulRegex);
        
        const result = match ? match[0] : cleaned;
        console.log("OCR Processed Result:", result);
        return result;
      }
    } catch (err: any) {
      console.error("Gemini API Error:", err);
      if (err.message?.includes("API key not valid")) {
        alert("Erro: Chave da API Gemini inválida.");
      } else if (err.message?.includes("quota")) {
        alert("Erro: Limite de uso da API Gemini excedido.");
      } else {
        alert(`Erro na API Gemini: ${err.message || "Erro desconhecido"}`);
      }
    }
    return null;
  };

  return (
    <div className={className}>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isProcessing}
        className="p-2 text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center"
        title="Tirar foto da placa"
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" size={18} />
        ) : (
          <Camera size={18} />
        )}
      </button>
    </div>
  );
}
