import { cleanupExpiredUploads } from "../service/photo/photo-cleanup.service";
import { cleanupExpiredSessions } from "../service/session/session-cleanup.service";

const CLEANUP_INTERVAL_MS = 60 * 1000;

let running = false;

export function startPhotoCleanupJob() {
  const run = async () => {
    if (running) {
      return;
    }

    running = true;

    try {
      const [
        uploadResult,
        sessionResult
      ] = await Promise.all([
        cleanupExpiredUploads(),
        cleanupExpiredSessions()
      ]);

      if (uploadResult.cleaned > 0) {
        console.log(
          `[photo-cleanup] found=${uploadResult.found} cleaned=${uploadResult.cleaned}`
        );
      }

      if (sessionResult.cleaned > 0) {
        console.log(
          `[session-cleanup] found=${sessionResult.found} cleaned=${sessionResult.cleaned}`
        );
      }
    } catch (error) {
      console.error(
        "[photo-cleanup] failed",
        error
      );
    } finally {
      running = false;
    }
  };

  const timeout =
    setTimeout(run, 5000);

  const interval =
    setInterval(
      run,
      CLEANUP_INTERVAL_MS
    );

  return () => {
    clearTimeout(timeout);
    clearInterval(interval);
  };
}