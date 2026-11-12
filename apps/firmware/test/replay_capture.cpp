// Replays a TTL log from the capture build through the shoe pedometer.
//
//   pnpm --filter @stepwhere/firmware test            # builds .builds/host/replay_capture
//   .builds/host/replay_capture walk-100-steps.log
//
// Only "A,x,y,z" lines are used, so the full TTL log can be passed unchanged.
// Prints the steps the current tuning detects, alongside the count the device
// reported live ("S,n" lines), for comparison with a hand-counted total.

#include <stdio.h>
#include <stdlib.h>

#include "../src/pedometer.h"

int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "usage: %s <capture.log>\n", argv[0]);
    return 2;
  }
  FILE *file = fopen(argv[1], "r");
  if (!file) {
    perror(argv[1]);
    return 2;
  }

  stepwhere::ShoePedometer pedometer;
  char line[256];
  unsigned long samples = 0, steps = 0, device_steps = 0;
  while (fgets(line, sizeof(line), file)) {
    int x, y, z, n;
    if (sscanf(line, "A,%d,%d,%d", &x, &y, &z) == 3) {
      ++samples;
      steps += pedometer.update((int16_t)x, (int16_t)y, (int16_t)z);
    } else if (sscanf(line, "S,%d", &n) == 1) {
      device_steps += n;
    }
  }
  fclose(file);

  printf("samples=%lu (%.1f s at 25 Hz) steps=%lu device_steps=%lu\n",
         samples, samples / 25.0, steps, device_steps);
  return 0;
}
