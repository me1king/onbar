const gsmBasicCharacters = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"));
const gsmExtensionCharacters = new Set(Array.from('\f^{}\\[~]|€'));

export function getSmsSegments(message: string) {
  let isGsm = true;
  let units = 0;
  for (const character of message) {
    if (gsmBasicCharacters.has(character)) units += 1;
    else if (gsmExtensionCharacters.has(character)) units += 2;
    else {
      isGsm = false;
      break;
    }
  }
  if (!isGsm) {
    units = Array.from(message).reduce((total, character) => total + (character.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  }
  const singleLimit = isGsm ? 160 : 70;
  const multipartLimit = isGsm ? 153 : 67;
  return {
    units,
    segments: units === 0 ? 0 : units <= singleLimit ? 1 : Math.ceil(units / multipartLimit),
    encoding: isGsm ? 'GSM-7' : 'Unicode'
  };
}
