/* Mates — question generators per operation and level (1–5).
 * Rules: answers are always non-negative, division is always
 * exact, and a round never repeats the same question. */
window.Mates = window.Mates || {};

Mates.questions = (function () {
  const OPS = ['add', 'sub', 'mul', 'div'];
  const SYMBOLS = { add: '+', sub: '−', mul: '×', div: '÷' };

  function randInt(min, max) { // inclusive both ends
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ---------- Per-level generators: each returns { a, b, answer } ---------- */

  function genAdd(level) {
    switch (level) {
      case 1: { // within 10 (no carry)
        const a = randInt(1, 9);
        return { a: a, b: randInt(1, 10 - a), answer: 0 };
      }
      case 2: { // within 20, carry happens naturally
        const a = randInt(5, 19);
        return { a: a, b: randInt(1, 20 - a), answer: 0 };
      }
      case 3: { // within 100
        const a = randInt(11, 89);
        return { a: a, b: randInt(1, 100 - a), answer: 0 };
      }
      case 4: { // within 1,000
        const a = randInt(100, 899);
        return { a: a, b: randInt(1, 999 - a), answer: 0 };
      }
      default: { // 3-digit + 3-digit
        const a = randInt(100, 899);
        return { a: a, b: randInt(100, 899), answer: 0 };
      }
    }
  }

  function genSub(level) {
    let minA, maxA, minB;
    switch (level) {
      case 1: minA = 2; maxA = 10; minB = 1; break;   // within 10
      case 2: minA = 5; maxA = 20; minB = 1; break;   // within 20, borrow possible
      case 3: minA = 11; maxA = 99; minB = 1; break;  // within 100
      case 4: minA = 100; maxA = 999; minB = 1; break;// within 1,000
      default: minA = 200; maxA = 999; minB = 100; break; // 3-digit − 3-digit
    }
    const a = randInt(minA, maxA);
    return { a: a, b: randInt(minB, a - 1), answer: 0 };
  }

  function genMul(level) {
    let d, n;
    switch (level) {
      case 1: d = pick([2, 5, 10]); n = randInt(1, 10); break;
      case 2: d = pick([3, 4, 6]); n = randInt(1, 12); break;
      case 3: d = pick([7, 8, 9]); n = randInt(1, 12); break;
      case 4: d = randInt(2, 12); n = randInt(2, 12); break; // mixed tables
      default: d = randInt(12, 99); n = randInt(2, 9); break; // 2-digit × 1-digit
    }
    return { a: d, b: n, answer: 0 };
  }

  function genDiv(level) {
    let d, qMin, qMax;
    switch (level) {
      case 1: d = pick([2, 5, 10]); qMin = 1; qMax = 10; break;   // within those tables
      case 2: d = randInt(2, 9); qMin = 1; qMax = 10; break;      // divisors up to 9
      case 3: d = randInt(2, 9); qMin = Math.ceil(10 / d); qMax = 12; break; // 2-digit dividend
      case 4: d = randInt(2, 12); qMin = 5; qMax = 20; break;     // larger exact division
      default: d = randInt(2, 9); qMin = Math.ceil(100 / d); qMax = 99; break; // 3-digit ÷ 1-digit
    }
    const q = randInt(qMin, qMax);
    return { a: d * q, b: d, answer: q };
  }

  const GENERATORS = { add: genAdd, sub: genSub, mul: genMul, div: genDiv };

  /** Generate one question. Returns { a, op, b, answer }. */
  function generate(op, level) {
    const g = GENERATORS[op];
    if (!g) throw new Error('unknown operation: ' + op);
    const q = g(Math.min(5, Math.max(1, level)));
    if (op === 'add') q.answer = q.a + q.b;
    else if (op === 'sub') q.answer = q.a - q.b;
    else if (op === 'mul') q.answer = q.a * q.b;
    // div already sets answer
    q.op = SYMBOLS[op];
    return q;
  }

  function key(q) { return q.a + q.op + q.b; }

  /** Generate a round of `count` unique questions. */
  function generateRound(op, level, count) {
    const qs = [];
    const seen = {};
    let guard = 0;
    while (qs.length < count && guard++ < 1000) {
      const q = generate(op, level);
      if (seen[key(q)]) continue;
      seen[key(q)] = true;
      qs.push(q);
    }
    while (qs.length < count) qs.push(generate(op, level)); // tiny-space fallback
    return qs;
  }

  return { OPS: OPS, SYMBOLS: SYMBOLS, generate: generate, generateRound: generateRound };
})();
