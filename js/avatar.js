/* Mates — cozy layered-SVG avatar renderer.
 * An avatar is a small config object; renderAvatar() composes
 * SVG layers (back hair -> face -> cheeks -> eyes -> mouth ->
 * front hair) and returns an SVG string usable at any size. */
window.Mates = window.Mates || {};

Mates.avatar = (function () {
  const SKINS = ['#ffdfc4', '#f5c9a3', '#e8b088', '#d1946a', '#a9714b', '#7c5236'];
  const HAIR_COLORS = ['#e8b64c', '#8d5a3a', '#3a3138', '#b5573a', '#9a9aa5', '#5b8dd9', '#e88bb0'];
  const INK = '#3a3138';      /* eyes / mouth line color */
  const MOUTH_FILL = '#9c4a3c';
  const CHEEK = '#ef8f7f';

  /** Default avatar config (also the bounds for random()). */
  const DEFAULT = { face: 0, skin: 1, hair: 1, hairColor: 1, eyes: 0, mouth: 0 };

  function faceShape(kind, fill) {
    switch (kind) {
      case 1: return '<rect x="19" y="23" width="62" height="62" rx="24" fill="' + fill + '"/>';
      case 2: return '<ellipse cx="50" cy="54" rx="29" ry="33" fill="' + fill + '"/>';
      default: return '<circle cx="50" cy="54" r="32" fill="' + fill + '"/>';
    }
  }

  function cheeks() {
    return '<circle cx="31" cy="61" r="5" fill="' + CHEEK + '" opacity="0.5"/>' +
           '<circle cx="69" cy="61" r="5" fill="' + CHEEK + '" opacity="0.5"/>';
  }

  function eyes(kind) {
    switch (kind) {
      case 1: /* happy arcs */
        return '<path d="M 33 53 Q 38 47 43 53" stroke="' + INK + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
               '<path d="M 57 53 Q 62 47 67 53" stroke="' + INK + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
      case 2: /* wide with highlights */
        return '<circle cx="38" cy="52" r="5.5" fill="' + INK + '"/><circle cx="40" cy="50" r="1.8" fill="#fff"/>' +
               '<circle cx="62" cy="52" r="5.5" fill="' + INK + '"/><circle cx="64" cy="50" r="1.8" fill="#fff"/>';
      default: /* dots */
        return '<circle cx="38" cy="52" r="3.5" fill="' + INK + '"/>' +
               '<circle cx="62" cy="52" r="3.5" fill="' + INK + '"/>';
    }
  }

  function mouth(kind) {
    switch (kind) {
      case 1: /* big grin */
        return '<path d="M 40 63 Q 50 77 60 63 Z" fill="' + MOUTH_FILL + '"/>';
      case 2: /* small open smile */
        return '<path d="M 44 64 Q 50 71 56 64 Z" fill="' + MOUTH_FILL + '"/>';
      default: /* simple smile line */
        return '<path d="M 42 64 Q 50 72 58 64" stroke="' + INK + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
    }
  }

  /* Front cap shared by short / bob / pigtails: crescent over the forehead. */
  const CAP = 'M 18 52 Q 18 20 50 20 Q 82 20 82 52 Q 74 36 50 36 Q 26 36 18 52 Z';

  function hairBack(kind, fill) {
    switch (kind) {
      case 1: /* short */
        return '<circle cx="50" cy="50" r="34" fill="' + fill + '"/>';
      case 2: /* curly — scalloped ring of puffs */
        return '<g fill="' + fill + '">' +
          '<circle cx="24" cy="36" r="11"/><circle cx="37" cy="26" r="11"/>' +
          '<circle cx="52" cy="24" r="11"/><circle cx="66" cy="29" r="11"/>' +
          '<circle cx="77" cy="40" r="11"/><circle cx="17" cy="50" r="10"/>' +
          '<circle cx="83" cy="50" r="10"/></g>';
      case 3: /* long — big mass behind the face, down past the chin */
        return '<path d="M 14 50 Q 14 18 50 18 Q 86 18 86 50 L 86 78 Q 86 92 72 92 L 28 92 Q 14 92 14 78 Z" fill="' + fill + '"/>';
      case 4: /* bob — rounded frame around the face */
        return '<ellipse cx="50" cy="56" rx="38" ry="36" fill="' + fill + '"/>';
      case 5: /* pigtails — side puffs (cap drawn in front layer) */
        return '<circle cx="14" cy="46" r="11" fill="' + fill + '"/><circle cx="86" cy="46" r="11" fill="' + fill + '"/>';
      default: /* bald */
        return '';
    }
  }

  function hairFront(kind, fill) {
    switch (kind) {
      case 2: /* curly — two temple puffs over the forehead edge */
        return '<circle cx="26" cy="44" r="9" fill="' + fill + '"/><circle cx="74" cy="44" r="9" fill="' + fill + '"/>';
      case 1:
      case 3:
      case 4:
      case 5:
        return '<path d="' + CAP + '" fill="' + fill + '"/>';
      default:
        return '';
    }
  }

  /** Render an avatar SVG string. size = width/height in px. */
  function render(config, size) {
    const c = Object.assign({}, DEFAULT, config || {});
    const skin = SKINS[c.skin] || SKINS[0];
    const hairColor = HAIR_COLORS[c.hairColor] || HAIR_COLORS[0];

    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" role="img" aria-hidden="true">';
    svg += hairBack(c.hair, hairColor);
    svg += faceShape(c.face, skin);
    svg += cheeks();
    svg += eyes(c.eyes);
    svg += mouth(c.mouth);
    svg += hairFront(c.hair, hairColor);
    svg += '</svg>';
    return svg;
  }

  /** Random config for the "Surprise me" button. */
  function random() {
    const pick = function (n) { return Math.floor(Math.random() * n); };
    return { face: pick(3), skin: pick(SKINS.length), hair: pick(6), hairColor: pick(HAIR_COLORS.length), eyes: pick(3), mouth: pick(3) };
  }

  return { DEFAULT: DEFAULT, SKINS: SKINS, HAIR_COLORS: HAIR_COLORS, render: render, random: random };
})();
