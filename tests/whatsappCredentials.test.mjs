import test from 'node:test';
import assert from 'node:assert/strict';
import { getWhatsAppCredentials } from '../lib/whatsappCredentials.ts';

test('prefers the canonical WhatsApp environment variable names', () => {
    assert.deepEqual(getWhatsAppCredentials({
        WHATSAPP_TOKEN: ' canonical-token ',
        WHATSAPP_ACCESS_TOKEN: 'legacy-token',
        WHATSAPP_PHONE_ID: ' canonical-phone ',
        WHATSAPP_PHONE_NUMBER_ID: 'legacy-phone'
    }), {
        token: 'canonical-token',
        phoneId: 'canonical-phone',
        configured: true
    });
});

test('supports the legacy WhatsApp variable names used by existing deployments', () => {
    assert.deepEqual(getWhatsAppCredentials({
        WHATSAPP_ACCESS_TOKEN: ' legacy-token ',
        WHATSAPP_PHONE_NUMBER_ID: ' legacy-phone '
    }), {
        token: 'legacy-token',
        phoneId: 'legacy-phone',
        configured: true
    });
});

test('reports WhatsApp as unconfigured until both credentials are present', () => {
    assert.deepEqual(getWhatsAppCredentials({ WHATSAPP_ACCESS_TOKEN: 'token-only' }), {
        token: 'token-only',
        phoneId: '',
        configured: false
    });
});
