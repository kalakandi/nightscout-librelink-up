process.env.SINGLE_SHOT="true";
process.env.NIGHTSCOUT_URL="localhost:1337";
process.env.NIGHTSCOUT_DISABLE_HTTPS="true";
process.env.NIGHTSCOUT_API_TOKEN="abcdefg";

// Tests must never reach the real LibreLink Up / Nightscout services. The app starts a run as soon as it is
// imported, which can happen before a test has installed its mock, so requests fail unless a mock handles them.
// A test's MockAdapter replaces this adapter.
require("axios").defaults.adapter = (config) =>
    Promise.reject(new Error(`Unmocked HTTP request in test: ${String(config.method).toUpperCase()} ${config.url}`));
