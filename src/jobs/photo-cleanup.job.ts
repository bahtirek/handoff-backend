import { cleanupExpiredUploads } from "../service/photo/photo-cleanup.service";

const CLEANUP_INTERVAL_MS = 10 * 1000; // 1 minute

let running = false;

export function startPhotoCleanupJob() {
  const run = async () => {
    if (running) {
      return;
    }

    running = true;

    try {
      const result = await cleanupExpiredUploads();

      if (result.cleaned > 0) {
        console.log(
          `[photo-cleanup] found=${result.found} cleaned=${result.cleaned}`
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

  // Run once shortly after startup.
  setTimeout(run, 5000);

  // Then every minute.
  setInterval(run, CLEANUP_INTERVAL_MS);
}
