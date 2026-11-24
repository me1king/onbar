import axios from "axios";

/**
 * Sends a WhatsApp message via the official Meta Cloud API (v23.0).
 */
export async function sendWhatsAppMessage(to: string, text: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
        console.warn("[WhatsApp] Credentials missing in environment variables.");
        return;
    }

    try {
        await axios.post(
            `https://graph.facebook.com/v23.0/${phoneId}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: text }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );
        console.log(`[WhatsApp] Message successfully dispatched to ${to}`);
    } catch (err: unknown) {
        console.error("[WhatsApp] Dispatch failed:", (err as Error).message || err);
        throw err;
    }
}
