export function isMobileOrTablet(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Detecta Android, iPad, iPhone o navegadores móviles comunes
  const isMobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  
  return isMobileRegex && isTouchDevice;
}