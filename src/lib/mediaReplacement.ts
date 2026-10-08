// Own every replacement track until the caller commits it. Old capture remains
// owned by the call, so hangup/failure can stop both sets without an async gap.
export function createMediaReplacement() {
  let disposed = false;
  let busy = false;
  let pending: MediaStream | null = null;
  const stopTracks = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());
  return {
    async run(options: {
      acquire: () => Promise<MediaStream>;
      isCurrent: () => boolean;
      senders: RTCRtpSender[];
      commit: (stream: MediaStream) => void;
    }) {
      if (disposed || busy || !options.isCurrent()) return false;
      busy = true;
      let candidate: MediaStream | null = null;
      let committed = false;
      try {
        candidate = await options.acquire();
        candidate.getTracks().forEach((track) => { track.enabled = false; });
        if (disposed || !options.isCurrent()) return false;
        pending = candidate;
        for (const sender of options.senders) {
          const track = candidate.getTracks().find((value) => value.kind === sender.track?.kind);
          if (track) await sender.replaceTrack(track);
          if (disposed || !options.isCurrent()) return false;
        }
        options.commit(candidate); // Synchronous: enable using the latest mute choices.
        committed = true;
        return true;
      } finally {
        if (candidate && !committed) stopTracks(candidate);
        pending = null;
        busy = false;
      }
    },
    dispose() { disposed = true; if (pending) stopTracks(pending); pending = null; },
  };
}
