import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are the Discipline OS Intelligence Module.
Your role is to provide strict, analytical performance audits for young men (15-20) focused on study and gym.

Rules:
- Tone: Cold, technical, authoritative.
- No emotional support.
- Identify "Logic Errors" (excuses).
- Provide "Corrective Actions" (structural changes).
- Use bullet points.
- Max 120 words.
- Focus on the "Discipline Score" and "Consistency" metrics.
- Analyze the provided task log data for failure patterns.`;

export async function analyzeDiscipline(input: string, userApiKey?: string) {
  // If no user key is provided, we use the environment key (fallback)
  // However, the UI now forces connection, so userApiKey should be present for GPT
  
  if (userApiKey && userApiKey.startsWith('sk-')) {
    // OpenAI GPT Implementation
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: input }
          ],
          temperature: 0.2
        })
      });
      const data = await response.json();
      return data.choices[0].message.content || "Analysis failed.";
    } catch (error) {
      console.error("GPT API Error:", error);
      return "Error: GPT connection failed. Check your API key.";
    }
  }

  // Gemini Implementation
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey: apiKey! });
  const model = "gemini-3.1-pro-preview";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: input,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
      },
    });

    return response.text || "Analysis failed. Re-submit data.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error: System offline or invalid key.";
  }
}
