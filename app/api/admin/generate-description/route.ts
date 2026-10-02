import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request: Request) {
    try {
        const { name, category, description, locale } = await request.json();

        if (typeof name !== 'string' || !name.trim()) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }
        const outputLanguage = locale === 'sw' ? 'Kenyan Swahili' : 'English';
        const productFacts = [
            `Product name: ${name.trim()}`,
            typeof category === 'string' && category.trim() ? `Category: ${category.trim()}` : null,
            typeof description === 'string' && description.trim() ? `Existing product description: ${description.trim()}` : null
        ].filter(Boolean).join('\n');
        let providerFailure = false;

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
                                text: `Write concise marketing copy in ${outputLanguage} using only the verified product facts below. Do not invent flavor, ingredients, origin, alcohol percentage, stock, delivery coverage, scarcity, discounts, awards, or availability claims. If the facts are limited, keep the copy general and factual. Maximum 60 words.\n\n${productFacts}`
                            }]
                        }]
                    })
                });

                const data = await response.json();
                const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!response.ok) {
                    providerFailure = true;
                    console.error('Gemini description request failed with status:', response.status);
                } else if (typeof aiText === 'string' && aiText.trim()) {
                    return NextResponse.json({ description: aiText.trim() });
                } else {
                    providerFailure = true;
                }
            } catch (err) {
                providerFailure = true;
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
                            { role: 'user', content: `Write concise marketing copy in ${outputLanguage} using only the verified product facts below. Do not invent flavor, ingredients, origin, alcohol percentage, stock, delivery coverage, scarcity, discounts, awards, or availability claims. If the facts are limited, keep the copy general and factual. Maximum 60 words.\n\n${productFacts}` }
                        ],
                        max_tokens: 100
                    })
                });

                const data = await response.json();
                const aiText = data.choices?.[0]?.message?.content;
                if (!response.ok) {
                    providerFailure = true;
                    console.error('OpenAI description request failed with status:', response.status);
                } else if (typeof aiText === 'string' && aiText.trim()) {
                    return NextResponse.json({ description: aiText.trim() });
                } else {
                    providerFailure = true;
                }
            } catch (err) {
                providerFailure = true;
                console.error("OpenAI API Error:", err);
            }
        }

        return NextResponse.json(
            {
                error: providerFailure
                    ? "AI description generation failed. Check the configured provider and try again."
                    : "AI description generation is unavailable. Configure a provider key and try again."
            },
            { status: providerFailure ? 502 : 503 }
        );

    } catch (error) {
        console.error('Description generation request failed:', error);
        return NextResponse.json({ error: "Failed to generate description" }, { status: 500 });
    }
}
