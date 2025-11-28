export class AudioService {
  private audio: HTMLAudioElement;
  private screamUrl = 'https://www.myinstants.com/media/sounds/final_60108db6919bc200b087a3a2_239343.mp3';

  constructor() {
    this.audio = new Audio(this.screamUrl);
    this.audio.preload = 'auto';
  }

  public async load(): Promise<void> {
    return new Promise((resolve) => {
      // If already ready (HAVE_FUTURE_DATA = 3, HAVE_ENOUGH_DATA = 4)
      if (this.audio.readyState >= 3) {
          resolve();
          return;
      }

      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = (e: Event) => {
        console.warn("Audio failed to preload, will try to stream on demand:", e);
        cleanup();
        resolve();
      };

      const cleanup = () => {
        this.audio.removeEventListener('canplaythrough', onLoaded);
        this.audio.removeEventListener('error', onError);
      };

      this.audio.addEventListener('canplaythrough', onLoaded);
      this.audio.addEventListener('error', onError);
      
      this.audio.load();
    });
  }

  public async resumeContext() {
    // Unlock audio on mobile devices by playing and pausing inside a user interaction
    try {
        // Mute to avoid noise during unlock
        this.audio.muted = true; 
        await this.audio.play();
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.muted = false;
    } catch (e) {
        console.log("Audio unlock failed (harmless if not on strict autoplay browser):", e);
    }
  }

  public async playScream() {
    try {
        this.audio.currentTime = 0;
        await this.audio.play();
    } catch (e) {
        console.error("Play failed:", e);
    }
  }
}