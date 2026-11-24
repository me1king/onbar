export function normalizeKenyanRiderPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('254')
    ? digits.slice(3)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  return /^[17]\d{8}$/.test(national) ? `254${national}` : null;
}

export function getKenyanWhatsAppNumber(value: string) {
  return normalizeKenyanRiderPhone(value) || value.replace(/\D/g, '');
}

export async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(input);
  if (!copied) throw new Error('Clipboard access is unavailable in this browser.');
}
