type Environment = Record<string, string | undefined>;

export function getWhatsAppCredentials(environment: Environment = process.env) {
  const token = environment.WHATSAPP_TOKEN?.trim()
    || environment.WHATSAPP_ACCESS_TOKEN?.trim()
    || '';
  const phoneId = environment.WHATSAPP_PHONE_ID?.trim()
    || environment.WHATSAPP_PHONE_NUMBER_ID?.trim()
    || '';

  return { token, phoneId, configured: Boolean(token && phoneId) };
}
