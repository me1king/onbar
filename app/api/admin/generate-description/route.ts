import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request: Request) {
    try {
        const { name, category } = await request.json();

        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        // 1. Resolve Active Gemini / OpenAI API Key (Environment variable or Admin Panel Settings)
        let activeGeminiKey = process.env.GOOGLE_GEMINI_API_KEY;
        let activeOpenAIKey = process.env.OPENAI_API_KEY;

        if ((!activeGeminiKey || !activeOpenAIKey) && supabase) {
            try {
                const { data: aiSettings } = await supabase
                    .from('settings')
                    .select('value')
                    .eq('key', 'ai_config')
                    .single();

                if (aiSettings?.value) {
                    const cfg = aiSettings.value as Record<string, string>;
                    if (cfg.google_gemini_api_key) activeGeminiKey = cfg.google_gemini_api_key;
                    if (cfg.openai_api_key) activeOpenAIKey = cfg.openai_api_key;
                }
            } catch (err) {
                console.warn("AI Settings Key Fetch Warning:", err);
            }
        }

        // If Gemini fails or returns no description, try the configured OpenAI provider.
        if (activeGeminiKey) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${activeGeminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `Write a professional, persuasive, and high-converting marketing description for a beverage or snack product.
                                Product Name: ${name}
                                Category: ${category}
                                Target Market: Kenya
                                Style: Premium, appetizing, focus on flavor profiles and occasion.
                                Max 60 words.`
                            }]
                        }]
                    })
                });

                const data = await response.json();
                const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;

                if (aiText) {
                    return NextResponse.json({ description: aiText.trim() });
                }
            } catch (err) {
                console.error("Gemini API Error:", err);
            }
        }

        // 3. Failover to OpenAI GPT-4o if OpenAI Key exists
        if (activeOpenAIKey) {
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${activeOpenAIKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: 'You are a master mixology copywriter for Online Bar Nairobi.' },
                            { role: 'user', content: `Write a 50-word sales description for ${name} (${category}).` }
                        ],
                        max_tokens: 100
                    })
                });

                const data = await response.json();
                const aiText = data.choices?.[0]?.message?.content;
                if (aiText) {
                    return NextResponse.json({ description: aiText.trim() });
                }
            } catch (err) {
                console.error("OpenAI API Error:", err);
            }
        }

        return NextResponse.json(
            { error: "AI description generation is unavailable. Configure a provider key and try again." },
            { status: 503 }
        );

    } catch {
        return NextResponse.json({ error: "Failed to generate description" }, { status: 500 });
    }
}
