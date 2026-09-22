// Playback: fallback across a station's stream URLs, reconnect after a mid-stream
// drop, real frequency data when the stream allows CORS (C-11, C-13).
// Knows nothing about the station list or playlist order — see stations-db.js
// and app.js for next/previous wiring (including Media Session's next/prev keys).

const ERR = { 1: 'aborted', 2: 'network error', 3: 'decode error', 4: 'refused or not audio' };
const MAX_RETRIES = 4;
const SILENCE_MS = 4000;
const MIN_ATTEMPT_GAP_MS = 400;

export class Player extends EventTarget {
  constructor() {
    super();
    this.audio = null;
    this.station = null;
    this.volume = 0.8;
    this.playing = false;

    this._urlIdx = 0;
    this._useCors = true;
    this._hasPlayed = false;
    this._retries = 0;
    this._attemptId = 0;
    this._failures = [];

    this._ctx = null;
    this._analyser = null;
    this._gain = null;
    this._raf = null;
    this._freq = null;
    this._lastSound = 0;
    this._lastTime = 0;

    this._lastAttemptStart = 0;
    this._pendingTimer = null;
    this._quietAutoplayBlock = false;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Emits {key, params, isError} for the theme to translate with i18n's t(). */
  _status(key, params, isError) {
    this._emit('status', { key, params, isError: !!isError });
  }

  /**
   * Loads a station (station: null clears the player, e.g. your last station
   * was removed). opts.quiet: a browser can never truly autoplay without a
   * real user gesture, no matter how long you wait first — so a boot-time
   * autostart attempt that gets blocked isn't an error, it's the expected
   * outcome; this falls back to the normal "press play" state instead of an
   * error message.
   */
  load(station, autoplay, opts = {}) {
    this.station = station;
    this._attemptId++;
    clearTimeout(this._pendingTimer);
    this._pendingTimer = null;
    this._quietAutoplayBlock = !!opts.quiet;
    this._teardown();
    this._resetChain();
    this.playing = false;
    this._emit('state', { playing: false, live: false, station });
    if (!station) return;
    if (autoplay) this.play();
    else this._status('player.pressPlay');
  }

  /**
   * Rate-limits real connection attempts to at most one every
   * MIN_ATTEMPT_GAP_MS. Mashing next/previous (or the play button) fires
   * overlapping create+play cycles on the underlying <audio> element fast
   * enough that Android Chrome's autoplay throttling can reject one
   * outright, leaving playback genuinely stopped — this way, only the
   * latest request ever actually starts connecting.
   */
  play() {
    if (!this.station) return;
    clearTimeout(this._pendingTimer);
    const elapsed = Date.now() - this._lastAttemptStart;
    if (elapsed >= MIN_ATTEMPT_GAP_MS) {
      this._pendingTimer = null;
      this._resetChain();
      this._attempt(false);
    } else {
      const station = this.station;
      this._status('player.connecting');
      this._pendingTimer = setTimeout(() => {
        this._pendingTimer = null;
        if (this.station === station) {
          this._resetChain();
          this._attempt(false);
        }
      }, MIN_ATTEMPT_GAP_MS - elapsed);
    }
  }

  /**
   * Pauses without destroying the <audio> element. A live stream can't resume
   * from where it left off anyway (play() always starts a fresh connection),
   * so there's nothing to gain by tearing it down here — and destroying it
   * (removeAttribute('src') + load()) is what makes Android Chrome drop our
   * Media Session while paused, handing "now playing" focus to another app.
   */
  stop() {
    this._attemptId++;
    clearTimeout(this._pendingTimer);
    this._pendingTimer = null;
    this._stopLevels();
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this.audio?.pause();
    this.playing = false;
    this._emit('state', { playing: false, live: false, station: this.station });
    this._status('player.stopped');
  }

  setVolume(v) {
    this.volume = v;
    if (this._gain) this._gain.gain.value = v;
    else if (this.audio) this.audio.volume = v;
  }

  _resetChain() {
    this._urlIdx = 0;
    this._useCors = true;
    this._hasPlayed = false;
    this._retries = 0;
    this._failures = [];
  }

  _attempt(cacheBust) {
    const quietAutoplayBlock = this._quietAutoplayBlock;
    this._quietAutoplayBlock = false;
    this._lastAttemptStart = Date.now();
    this._teardown();
    const id = ++this._attemptId;
    const base = this.station.urls[this._urlIdx];
    const url = cacheBust ? base + (base.includes('?') ? '&' : '?') + '_=' + Date.now() : base;

    const el = this.audio = new Audio();
    el.preload = 'none';
    if (this._useCors) el.crossOrigin = 'anonymous';
    el.volume = this.volume;
    el.src = url;
    const errText = () => el.error ? `${ERR[el.error.code]} [code ${el.error.code}]` : null;

    let failed = false;
    const fail = (why) => {
      if (failed || id !== this._attemptId) return;
      failed = true;
      this._onFailure(why);
    };

    el.addEventListener('playing', () => {
      if (id !== this._attemptId) return;
      this._hasPlayed = true;
      this._retries = 0;
      this.playing = true;
      this._emit('state', { playing: true, live: true, station: this.station });
      this._status(this._urlIdx > 0 ? 'player.onAirBackup' : 'player.onAir', { n: this._urlIdx + 1 });
      if (this._useCors) this._connectAnalyser();
    });
    el.addEventListener('waiting', () => {
      if (id !== this._attemptId) return;
      this._emit('state', { playing: this.playing, live: false, station: this.station });
      this._status('player.buffering');
    });
    el.addEventListener('stalled', () => { if (this._hasPlayed && !el.paused) fail('stalled'); });
    el.addEventListener('error', () => fail(errText() || 'error'));

    this._status(this._hasPlayed ? 'player.reconnecting' : 'player.connecting');
    el.play()
      .then(() => { if (id === this._attemptId) this.playing = true; })
      .catch(err => {
        if (id !== this._attemptId) return;
        if (err && err.name === 'NotAllowedError') {
          failed = true;
          this.playing = false;
          this._emit('state', { playing: false, live: false, station: this.station });
          if (quietAutoplayBlock) this._status('player.pressPlay');
          else this._status('player.blockedByBrowser', null, true);
          return;
        }
        if (err && err.name === 'AbortError') return;
        fail(errText() || (err && err.message) || 'failed');
      });
  }

  _onFailure(why) {
    this._emit('state', { playing: this.playing, live: false, station: this.station });

    if (this._hasPlayed && this._retries < MAX_RETRIES) {
      this._retries++;
      const wait = 1000 * this._retries;
      this._status('player.streamDropped', { seconds: wait / 1000, attempt: this._retries, max: MAX_RETRIES });
      const id = this._attemptId;
      setTimeout(() => { if (id === this._attemptId) this._attempt(true); }, wait);
      return;
    }

    this._failures.push(`stream ${this._urlIdx + 1}${this._useCors ? ' (cors)' : ''}: ${why}`);

    if (this._useCors) {
      this._useCors = false;
      this._hasPlayed = false;
      this._attempt(false);
      return;
    }

    if (this._urlIdx + 1 < this.station.urls.length) {
      this._urlIdx++;
      this._useCors = true;
      this._hasPlayed = false;
      this._retries = 0;
      this._status('player.tryingBackup', { n: this._urlIdx + 1 });
      this._attempt(false);
      return;
    }

    this._teardown();
    this.playing = false;
    this._emit('state', { playing: false, live: false, station: this.station });
    if (location.protocol === 'https:' && this.station.urls.some(u => u.startsWith('http:'))) {
      this._status('player.mixedContentBlocked', null, true);
    } else {
      this._status('player.allFailed', { name: this.station.name, details: this._failures.join('; ') }, true);
    }
  }

  _teardown() {
    this._stopLevels();
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._analyser = null;
    this._gain = null;
    if (this.audio) {
      const a = this.audio;
      this.audio = null;
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
  }

  _connectAnalyser() {
    if (this._analyser) return;
    try {
      this._ctx = this._ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'suspended') this._ctx.resume();

      const src = this._ctx.createMediaElementSource(this.audio);
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.minDecibels = -95;
      this._analyser.maxDecibels = -25;
      this._analyser.smoothingTimeConstant = 0.78;
      this._gain = this._ctx.createGain();
      this._gain.gain.value = this.volume;

      src.connect(this._analyser);
      this._analyser.connect(this._gain);
      this._gain.connect(this._ctx.destination);

      this.audio.volume = 1;
      this._freq = new Uint8Array(this._analyser.frequencyBinCount);
      this._lastSound = performance.now();
      this._lastTime = this.audio.currentTime;
      this._emit('analysed', { on: true });
      this._drawLevels();
    } catch {
      this._analyser = null;
      this._gain = null;
      this._emit('analysed', { on: false });
    }
  }

  _drawLevels() {
    if (!this._analyser) return;
    this._analyser.getByteFrequencyData(this._freq);
    this._emit('levels', this._freq);

    const any = this._freq.some(v => v > 0);
    const now = performance.now();
    if (any) this._lastSound = now;
    const advancing = this.audio && this.audio.currentTime > this._lastTime;
    if (this.audio) this._lastTime = this.audio.currentTime;
    if (!any && advancing && now - this._lastSound > SILENCE_MS) {
      this._failures.push(`stream ${this._urlIdx + 1} (cors): silent through Web Audio`);
      this._useCors = false;
      this._hasPlayed = false;
      this._status('player.buffering');
      this._attempt(false);
      return;
    }
    this._raf = requestAnimationFrame(() => this._drawLevels());
  }

  _stopLevels() {
    this._emit('levels', null);
  }
}
