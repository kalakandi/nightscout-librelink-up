# Sending readings to Apple Health with an iPhone Shortcut

Apple Health can only be written to from an Apple device, so the health export works in two parts:

1. This app serves your recent readings as JSON (`GET /readings`).
2. A Shortcut on your iPhone fetches them and logs them to Apple Health.

> The Shortcut steps below describe the actions involved. Action names and options can differ between iOS versions, so check them on your device. The server side of this guide is covered by tests; the Shortcut itself is not.

## 1. Turn the export on

Add these to your `.env` (see the [configuration table](../README.md#configuration)):

```
HEALTH_EXPORT_ENABLED=true
HEALTH_EXPORT_TOKEN="use-a-long-random-value"
HEALTH_EXPORT_PORT=8787
HEALTH_EXPORT_UNIT="mg/dL"
```

- The token is required. Generate one with `openssl rand -hex 24` or a password manager.
- `HEALTH_EXPORT_ENABLED` cannot be combined with `SINGLE_SHOT`, because the server needs a running process.
- Apple Health has traditionally worked with mg/dL for blood glucose, so `mg/dL` is the safest unit for the Shortcut. If you use `mmol/L`, check on your device that Health accepts that unit when logging.

Start the app as usual. The log shows `Health export listening on port 8787`.

## 2. Try it from a computer first

```bash
curl -H "Authorization: Bearer use-a-long-random-value" "http://localhost:8787/readings"
```

Example response:

```json
{
  "unit": "mg/dL",
  "samples": [
    {"timestamp": "2026-01-01T10:00:00.000Z", "value": 112, "unit": "mg/dL", "trend": "Flat"}
  ]
}
```

- `samples` are sorted oldest first. `trend` is only present for the newest reading.
- Add `?since=<ISO 8601 timestamp>` to receive only readings newer than that time. An invalid timestamp returns `400`.
- A missing or wrong token returns `401`. Any other path returns `404`.

## 3. Make it reachable from your phone

The server listens on all network interfaces on the configured port. Your phone has to reach the machine running the app, for example on the same Wi-Fi at `http://<computer-ip>:8787`.

- Allow the port in your computer's firewall for your **private** network only.
- Do not forward this port to the internet. The connection is plain HTTP, so the bearer token is sent unencrypted. Use it on a network you trust, or put a TLS reverse proxy or VPN in front of it.

## 4. Build the Shortcut

In the Shortcuts app, create a shortcut with these actions:

1. **Get Contents of URL**: `http://<computer-ip>:8787/readings?since=<last sync>`
   - Method `GET`, with the header `Authorization` = `Bearer <your token>`.
   - `<last sync>` is the newest timestamp you logged last time (see step 5). On the first run, leave out `?since=…`.
2. **Get Dictionary Value** for `samples`.
3. **Repeat with Each** item in `samples`:
   - **Get Dictionary Value** for `value` and for `timestamp`.
   - **Log Health Sample**: type *Blood Glucose*, the `value`, unit *mg/dL*, and the `timestamp` as the date (the action's date option defaults to the current time, so set it, otherwise every reading is logged as "now").
4. Remember the newest `timestamp` for the next run (step 5).

Run it by hand first. In Health, open **Browse → Body Measurements → Blood Glucose** and check the values and times.

## 5. Avoid duplicates

Health does not remove duplicate manual samples, so each reading must be logged only once. Store the newest logged `timestamp` between runs, for example in a text file in the Shortcuts folder in iCloud Drive (**Save File** at the end, **Get File** at the start), and pass it as `since`.

## 6. Run it automatically

Use the **Automation** tab in Shortcuts, for example a time-of-day automation that runs every hour. iOS decides how reliably automations run, and your computer has to be on and reachable, so expect gaps rather than live data.

## Limitations

- Readings are kept in memory (the latest 1000) and the buffer is empty after the app restarts until new readings arrive.
- The app still needs its Nightscout settings to start. Running without Nightscout is not supported yet.
- This is not a medical device. Do not base treatment decisions on data that has passed through this chain.
