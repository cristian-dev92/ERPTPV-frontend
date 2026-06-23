export function isMobileOrTablet(): boolean {
  // 🚨 BOTÓN DE EMERGENCIA: Si necesitas forzarlo en las pruebas de la tablet
  const override = localStorage.getItem('FORZAR_TECLADO_NATIVO');
  if (override === 'true') return true;
  if (override === 'false') return false;

  const userAgent = navigator.userAgent.toLowerCase();
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // 1. Detección estándar (Móviles y tablets antiguas o en modo móvil)
  const isStandardMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  
  // 2. iPads modernos (Desde iPadOS 13 dicen ser "Macintosh" pero tienen pantalla táctil)
  const isIpadDesktopMode = /macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  
  // 3. Tablets Android modernas (Chrome fuerza el modo escritorio, dicen ser "Linux x86_64" pero son táctiles)
  // ⚠️ NOTA: Si tu ordenador principal del mostrador usa Windows, cualquier dispositivo "Linux + Táctil" es la tablet.
  const isAndroidTabletDesktopMode = /linux/i.test(userAgent) && isTouchDevice;

  // Dejamos un log en la consola para que abras el inspector en la tablet y veas qué está reportando exactamente
  console.log(`[TPV Device Check] UA: ${userAgent} | Touch: ${isTouchDevice} | Res: ${isStandardMobile || isIpadDesktopMode || isAndroidTabletDesktopMode}`);

  return isStandardMobile || isIpadDesktopMode || isAndroidTabletDesktopMode;
}