/**
 * Small HTTP endpoint that exposes recent readings for an iPhone Shortcut
 * (which can log them into Apple Health).
 *
 * SPDX-License-Identifier: MIT
 */
import {createServer, IncomingMessage, Server, ServerResponse} from "node:http";
import * as crypto from "crypto";
import {GlucoseUnit, ReadingBuffer, toHealthSamples} from "./samples";

export interface HealthServerOptions
{
    token: string;
    unit: GlucoseUnit;
    buffer: ReadingBuffer;
}

function sha256(value: string): Buffer
{
    return crypto.createHash("sha256").update(value).digest();
}

function isAuthorized(req: IncomingMessage, token: string): boolean
{
    const header = req.headers.authorization ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    // Hash both sides so lengths match and the comparison is constant-time.
    return crypto.timingSafeEqual(sha256(provided), sha256(token));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void
{
    res.writeHead(status, {"Content-Type": "application/json"});
    res.end(JSON.stringify(body));
}

export function createHealthServer({token, unit, buffer}: HealthServerOptions): Server
{
    return createServer((req, res) =>
    {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (req.method !== "GET" || url.pathname !== "/readings")
        {
            sendJson(res, 404, {error: "not found"});
            return;
        }

        if (!isAuthorized(req, token))
        {
            sendJson(res, 401, {error: "unauthorized"});
            return;
        }

        const sinceParam = url.searchParams.get("since");
        let since: Date | undefined;
        if (sinceParam !== null)
        {
            since = new Date(sinceParam);
            if (isNaN(since.getTime()))
            {
                sendJson(res, 400, {error: "since must be an ISO 8601 timestamp"});
                return;
            }
        }

        sendJson(res, 200, {unit, samples: toHealthSamples(buffer.all(), unit, since)});
    });
}
