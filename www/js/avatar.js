/* Mates — cozy layered-SVG avatar renderer.
 * An avatar is a small config object; renderAvatar() composes
 * SVG layers (back hair -> face -> cheeks -> freckles -> eyes ->
 * mouth -> front hair -> earrings -> glasses -> hat -> hairpin)
 * and returns an SVG string usable at any size.
 *
 * Config slots (all integers, 0 = none/default):
 *   face 0-2, skin 0-7, hair 0-9 (0=bald), hairColor 0-9,
 *   eyes 0-2, mouth 0-2, glasses 0-4, hat 0-4, hairpin 0-4,
 *   earrings 0-2, freckles 0-1. */
window.Mates = window.Mates || {};

Mates.avatar = (function () {
  const SKINS = ['#ffe8d6', '#ffdfc4', '#f5c9a3', '#e8b088',
                 '#d1946a', '#a9714b', '#7c5236', '#5c3a24'];
  const HAIR_COLORS = ['#e8b64c', '#8d5a3a', '#3a3138', '#b5573a', '#9a9aa5',
                       '#5b8dd9', '#e88bb0', '#b39ddb', '#7fd1ae', '#f2994a'];
  const INK = '#3a3138';      /* eyes / mouth line color */
  const MOUTH_FILL = '#9c4a3c';
  const CHEEK = '#ef8f7f';
  const GOLD = '#f2c14e';
  const ROSE = '#e96b9f';
  const ROSE_DK = '#d15a8c';
  const LAVENDER = '#9b8cd9';

  /** Default avatar config (also the bounds for random()). */
  const DEFAULT = { face: 0, skin: 1, hair: 1, hairColor: 1, eyes: 0, mouth: 0,
                    glasses: 0, hat: 0, hairpin: 0, earrings: 0, freckles: 0 };

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

  function freckles() {
    return '<g fill="#c97b5a" opacity="0.8">' +
      '<circle cx="27" cy="59" r="1.3"/><circle cx="32" cy="62" r="1.3"/><circle cx="29" cy="65" r="1.3"/>' +
      '<circle cx="73" cy="59" r="1.3"/><circle cx="68" cy="62" r="1.3"/><circle cx="71" cy="65" r="1.3"/></g>';
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

  /* Front cap shared by most styles: crescent over the forehead. */
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
      case 6: /* ponytail — high tail sweeping down the right side */
        return '<circle cx="78" cy="28" r="10" fill="' + fill + '"/>' +
               '<path d="M 84 34 Q 93 50 85 68 Q 81 77 76 70 Q 83 55 77 40 Z" fill="' + fill + '"/>';
      case 7: /* space buns — twin puffs on top */
        return '<circle cx="26" cy="26" r="11" fill="' + fill + '"/><circle cx="74" cy="26" r="11" fill="' + fill + '"/>';
      case 8: /* braids — chains of puffs down each side */
        return '<g fill="' + fill + '">' +
          '<circle cx="19" cy="42" r="9"/><circle cx="16" cy="56" r="8"/><circle cx="14" cy="70" r="7"/><circle cx="13" cy="82" r="6"/>' +
          '<circle cx="81" cy="42" r="9"/><circle cx="84" cy="56" r="8"/><circle cx="86" cy="70" r="7"/><circle cx="87" cy="82" r="6"/></g>';
      case 9: /* wavy long — scalloped bottom edge */
        return '<path d="M 14 50 Q 14 18 50 18 Q 86 18 86 50 L 86 72 Q 80 82 74 73 Q 68 82 62 73 Q 56 82 50 73 Q 44 82 38 73 Q 32 82 26 73 Q 20 82 14 72 Z" fill="' + fill + '"/>';
      default: /* bald */
        return '';
    }
  }

  function hairFront(kind, fill) {
    if (kind === 0) return '';
    if (kind === 2) { /* curly — two temple puffs over the forehead edge */
      return '<circle cx="26" cy="44" r="9" fill="' + fill + '"/><circle cx="74" cy="44" r="9" fill="' + fill + '"/>';
    }
    let s = '<path d="' + CAP + '" fill="' + fill + '"/>';
    if (kind === 6) s += '<circle cx="78" cy="30" r="4.5" fill="' + ROSE_DK + '"/>'; /* ponytail tie */
    return s;
  }

  function glasses(kind) {
    switch (kind) {
      case 1: /* round wire frames */
        return '<g stroke="' + INK + '" stroke-width="2.5" fill="none">' +
          '<circle cx="38" cy="52" r="9"/><circle cx="62" cy="52" r="9"/>' +
          '<path d="M 47 51 Q 50 48 53 51"/></g>';
      case 2: /* heart sunglasses */
        return '<path d="M 38 60 C 29 52 31 43 38 48 C 45 43 47 52 38 60 Z" fill="' + LAVENDER + '" stroke="' + INK + '" stroke-width="1.5"/>' +
               '<path d="M 62 60 C 53 52 55 43 62 48 C 69 43 71 52 62 60 Z" fill="' + LAVENDER + '" stroke="' + INK + '" stroke-width="1.5"/>' +
               '<path d="M 46 49 L 54 49" stroke="' + INK + '" stroke-width="2"/>';
      case 3: /* cat-eye with upturned flicks */
        return '<g stroke="' + INK + '" stroke-width="2.5" fill="none">' +
          '<path d="M 29 56 Q 27 45 38 45 Q 47 45 47 51 L 47 56 Q 38 62 29 56 Z"/>' +
          '<path d="M 71 56 Q 73 45 62 45 Q 53 45 53 51 L 53 56 Q 62 62 71 56 Z"/>' +
          '<path d="M 29 48 L 25 44"/><path d="M 71 48 L 75 44"/>' +
          '<path d="M 47 49 L 53 49"/></g>';
      case 4: /* star shades */
        return '<path d="M 38 43 L 40.4 48.8 L 46.6 49.2 L 41.8 53.2 L 43.3 59.3 L 38 56 L 32.7 59.3 L 34.2 53.2 L 29.4 49.2 L 35.7 48.8 Z" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.5"/>' +
               '<path d="M 62 43 L 59.6 48.8 L 53.4 49.2 L 58.2 53.2 L 56.7 59.3 L 62 56 L 67.3 59.3 L 65.8 53.2 L 70.6 49.2 L 64.3 48.8 Z" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.5"/>' +
               '<path d="M 47 51 L 53 51" stroke="' + INK + '" stroke-width="2"/>';
      default: return '';
    }
  }

  function hat(kind) {
    switch (kind) {
      case 1: /* beanie with pom-pom */
        return '<path d="M 20 40 Q 20 15 50 15 Q 80 15 80 40 Z" fill="' + ROSE + '"/>' +
               '<rect x="18" y="35" width="64" height="10" rx="5" fill="' + ROSE_DK + '"/>' +
               '<circle cx="50" cy="14" r="6" fill="#fffafd"/>';
      case 2: /* party hat */
        return '<path d="M 50 5 L 31 40 L 69 40 Z" fill="' + LAVENDER + '"/>' +
               '<circle cx="50" cy="7" r="4" fill="' + GOLD + '"/>' +
               '<circle cx="45" cy="28" r="2.5" fill="#fffafd"/><circle cx="56" cy="23" r="2.5" fill="' + ROSE + '"/>';
      case 3: /* beret */
        return '<ellipse cx="52" cy="29" rx="29" ry="14" fill="' + ROSE + '"/>' +
               '<circle cx="50" cy="16" r="3.5" fill="' + ROSE_DK + '"/>';
      case 4: /* princess crown */
        return '<path d="M 31 42 L 31 24 L 41 34 L 50 19 L 59 34 L 69 24 L 69 42 Z" fill="' + GOLD + '" stroke="#d9a53a" stroke-width="1.5"/>' +
               '<rect x="31" y="40" width="38" height="7" rx="3.5" fill="' + GOLD + '"/>' +
               '<circle cx="50" cy="36" r="3" fill="' + ROSE + '"/>';
      default: return '';
    }
  }

  function hairpin(kind) {
    switch (kind) {
      case 1: /* bow, upper left */
        return '<path d="M 30 26 L 17 18 L 20 35 Z" fill="' + ROSE + '"/>' +
               '<path d="M 30 26 L 43 18 L 40 35 Z" fill="' + ROSE + '"/>' +
               '<circle cx="30" cy="26" r="4.5" fill="' + ROSE_DK + '"/>';
      case 2: /* flower crown across the top */
        return '<g>' +
          '<circle cx="27" cy="31" r="4.5" fill="' + ROSE + '"/><circle cx="27" cy="31" r="1.8" fill="' + GOLD + '"/>' +
          '<circle cx="39" cy="22" r="4.5" fill="#fffafd"/><circle cx="39" cy="22" r="1.8" fill="' + GOLD + '"/>' +
          '<circle cx="51" cy="19" r="4.5" fill="' + ROSE + '"/><circle cx="51" cy="19" r="1.8" fill="' + GOLD + '"/>' +
          '<circle cx="63" cy="22" r="4.5" fill="#fffafd"/><circle cx="63" cy="22" r="1.8" fill="' + GOLD + '"/>' +
          '<circle cx="75" cy="31" r="4.5" fill="' + ROSE + '"/><circle cx="75" cy="31" r="1.8" fill="' + GOLD + '"/></g>';
      case 3: /* butterfly clip, upper right */
        return '<ellipse cx="67" cy="25" rx="6.5" ry="5" fill="' + LAVENDER + '"/>' +
               '<ellipse cx="80" cy="25" rx="6.5" ry="5" fill="' + LAVENDER + '"/>' +
               '<rect x="71.5" y="19" width="3.5" height="12" rx="1.75" fill="#7b68b8"/>';
      case 4: /* star clip */
        return '<path d="M 74 17 L 75.5 20.9 L 79.7 21.1 L 76.5 23.8 L 77.5 27.9 L 74 25.6 L 70.5 27.9 L 71.5 23.8 L 68.3 21.1 L 72.5 20.9 Z" fill="' + GOLD + '"/>';
      default: return '';
    }
  }

  function earrings(kind) {
    switch (kind) {
      case 1: /* gold hoops */
        return '<g stroke="' + GOLD + '" stroke-width="2.5" fill="none">' +
               '<circle cx="17" cy="64" r="5"/><circle cx="83" cy="64" r="5"/></g>';
      case 2: /* heart drops */
        return '<path d="M 17 70 C 12 65 14 59 17 61.5 C 20 59 22 65 17 70 Z" fill="' + ROSE + '"/>' +
               '<path d="M 83 70 C 78 65 80 59 83 61.5 C 86 59 88 65 83 70 Z" fill="' + ROSE + '"/>';
      default: return '';
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
    if (c.freckles) svg += freckles();
    svg += eyes(c.eyes);
    svg += mouth(c.mouth);
    svg += hairFront(c.hair, hairColor);
    svg += earrings(c.earrings);
    svg += glasses(c.glasses);
    svg += hat(c.hat);
    svg += hairpin(c.hairpin);
    svg += '</svg>';
    return svg;
  }

  /** Random config for the "Surprise me" button. */
  function random() {
    const pick = function (n) { return Math.floor(Math.random() * n); };
    return { face: pick(3), skin: pick(SKINS.length), hair: pick(10), hairColor: pick(HAIR_COLORS.length),
             eyes: pick(3), mouth: pick(3), glasses: pick(5), hat: pick(5), hairpin: pick(5),
             earrings: pick(3), freckles: pick(2) };
  }

  return { DEFAULT: DEFAULT, SKINS: SKINS, HAIR_COLORS: HAIR_COLORS, render: render, random: random };
})();
