(function () {
  const SUPPORTS_BEACON = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function';
  const ENDPOINT = '/__logs';
  const LEVELS = ['log', 'warn', 'error'];
  const original = {};

  LEVELS.forEach((level) => {
    if (typeof console[level] !== 'function') {
      return;
    }

    original[level] = console[level].bind(console);
    console[level] = (...args) => {
      try {
        original[level](...args);
      } catch (err) {
        // ignore console errors
      }

      try {
        const payload = JSON.stringify({ level, args: args.map(serializeArg) });
        if (SUPPORTS_BEACON) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(ENDPOINT, blob);
        } else {
          fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true
          }).catch(() => {});
        }
      } catch (err) {
        // Swallow errors so we never break the console
      }
    };
  });

  function serializeArg(arg) {
    try {
      if (arg instanceof Error) {
        return {
          message: arg.message,
          stack: arg.stack,
          name: arg.name
        };
      }
      if (typeof arg === 'object' && arg !== null) {
        return JSON.parse(JSON.stringify(arg));
      }
      return arg;
    } catch (error) {
      return String(arg);
    }
  }
})();
