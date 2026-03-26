import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Modality } from "@google/genai";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper to get AI instance with latest key
  const getAI = (requestApiKey?: string) => {
    const apiKey = requestApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || "";
    return new GoogleGenAI({ apiKey });
  };

  // API Routes
  app.get("/api/config", (req, res) => {
    res.json({
      hasKey: !!(process.env.API_KEY || process.env.GEMINI_API_KEY)
    });
  });

  app.post("/api/generate", async (req, res) => {
    try {
      const { model, contents, config, apiKey: userApiKey } = req.body;
      const ai = getAI(userApiKey);
      
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });

      res.json({
        text: response.text,
        functionCalls: response.functionCalls,
        candidates: response.candidates
      });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(error.status || 500).json({ 
        error: error.message || "Internal Server Error",
        status: error.status
      });
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text, apiKey: userApiKey } = req.body;
      const ai = getAI(userApiKey);
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      res.json({ audio: base64Audio });
    } catch (error: any) {
      console.error("TTS API Error:", error);
      res.status(error.status || 500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
