import { GoogleGenAI, Type } from "@google/genai";
import { FinanceInfo } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeFinanceEntry = async (text: string): Promise<FinanceInfo | null> => {
  if (!text || text.trim().length < 2) return null;

  // Detect user's context for currency localization
  const userLocale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  const userTimeZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are a financial analyst helper. The user will ask a question about cryptocurrencies or stocks. 
      
      CONTEXT:
      - User Locale: ${userLocale}
      - User Timezone: ${userTimeZone}

      INSTRUCTIONS:
      1. Provide a SUPER CONCISE answer (max 3-6 words). 
      2. It should be "blatant" and easy to read at a glance.
      3. CRITICAL: Detect the appropriate currency for the user's location (based on Locale/Timezone) and use that currency symbol for all prices (e.g., '£' for UK/en-GB, '€' for Eurozone, '¥' for Japan), unless the user explicitly asks for a specific currency in their question.

      Examples (if user is in UK): "£75,000", "Up 5%", "Strong Buy".
      Examples (if user is in US): "$95,000", "Bearish", "High Risk".
      
      User Question: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shortAnswer: { type: Type.STRING, description: "A very brief, direct answer with the correct local currency symbol (e.g., '£95,000', 'Bullish')." },
            sentiment: { type: Type.STRING, enum: ["positive", "negative", "neutral"], description: "The sentiment of the financial outlook." },
            confidenceScore: { type: Type.NUMBER, description: "Confidence score between 0 and 1" },
          },
        },
      },
    });

    const jsonText = response.text;
    if (!jsonText) return null;

    const data = JSON.parse(jsonText) as FinanceInfo;
    return data;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};