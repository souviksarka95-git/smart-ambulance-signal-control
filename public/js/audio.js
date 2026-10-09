/**
 * Web Audio API Sound Generator for Emergency Signals and Radar Alerts
 * 100% Client-side synthetic audio - requires no external audio assets.
 */

class EmergencyAudio {
    constructor() {
        this.ctx = null;
        this.enabled = false;
        this.sirenOsc = null;
        this.sirenGain = null;
        this.sirenLfo = null;
        this.isSirenPlaying = false;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleSound() {
        this.init();
        this.enabled = !this.enabled;
        if (!this.enabled && this.isSirenPlaying) {
            this.stopSiren();
        }
        return this.enabled;
    }

    // Short tactical radio chirp on signal preemption
    playPreemptAlert() {
        if (!this.enabled) return;
        this.init();
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now); // A5
            osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12); // A6

            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.25);
        } catch (e) {
            console.warn('Audio play failed:', e);
        }
    }

    // Beep when signal is released back to normal
    playReleaseBeep() {
        if (!this.enabled) return;
        this.init();
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.08); // E5

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.2);
        } catch (e) {
            console.warn('Audio play failed:', e);
        }
    }

    // Continuous electronic siren (wail)
    startSiren() {
        if (!this.enabled || this.isSirenPlaying) return;
        this.init();
        try {
            const now = this.ctx.currentTime;
            this.sirenOsc = this.ctx.createOscillator();
            this.sirenGain = this.ctx.createGain();
            this.sirenLfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();

            this.sirenOsc.type = 'sawtooth';
            this.sirenOsc.frequency.setValueAtTime(750, now);

            // LFO for wailing sweep
            this.sirenLfo.type = 'sine';
            this.sirenLfo.frequency.setValueAtTime(0.5, now); // 0.5 Hz cycle

            lfoGain.gain.setValueAtTime(250, now); // ±250 Hz range

            this.sirenLfo.connect(lfoGain);
            lfoGain.connect(this.sirenOsc.frequency);

            this.sirenGain.gain.setValueAtTime(0.08, now); // pleasant volume

            this.sirenOsc.connect(this.sirenGain);
            this.sirenGain.connect(this.ctx.destination);

            this.sirenOsc.start(now);
            this.sirenLfo.start(now);
            this.isSirenPlaying = true;
        } catch (e) {
            console.warn('Siren start failed:', e);
        }
    }

    stopSiren() {
        if (!this.isSirenPlaying) return;
        try {
            if (this.sirenOsc) {
                this.sirenOsc.stop();
                this.sirenOsc.disconnect();
            }
            if (this.sirenLfo) {
                this.sirenLfo.stop();
                this.sirenLfo.disconnect();
            }
            this.isSirenPlaying = false;
        } catch (e) {
            console.warn('Siren stop failed:', e);
        }
    }
}

window.emergencyAudio = new EmergencyAudio();
