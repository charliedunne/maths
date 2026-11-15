/* Mates — sound feedback via WebAudio (no audio assets).
 * Short, soft beeps: rising two-tone for correct, low buzz for wrong,
 * little arpeggio for new badges. Respects settings.sound; every
 * failure is swallowed so missing audio never breaks the app. */
window.Mates = window.Mates || {};

Mates.sound = {
  ctx: null,

  /** Play a feedback sound. kind: 'correct' | 'wrong' | 'badge'. */
  play: function (kind) {
    if (!Mates.settings || !Mates.settings.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!this.ctx) this.ctx = new Ctx();
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const t0 = this.ctx.currentTime;
      const tone = function (freq, start, dur) {
        const osc = Mates.sound.ctx.createOscillator();
        const gain = Mates.sound.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + start);
        gain.gain.exponentialRampToValueAtTime(0.2, t0 + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        osc.connect(gain);
        gain.connect(Mates.sound.ctx.destination);
        osc.start(t0 + start);
        osc.stop(t0 + start + dur + 0.05);
      };

      if (kind === 'correct') { tone(660, 0, 0.12); tone(880, 0.1, 0.15); }
      else if (kind === 'wrong') { tone(220, 0, 0.2); }
      else if (kind === 'badge') { tone(523, 0, 0.1); tone(659, 0.09, 0.1); tone(784, 0.18, 0.2); }
    } catch (e) {
      /* Audio unavailable (no user gesture yet, blocked, etc.) — ignore. */
    }
  }
};
