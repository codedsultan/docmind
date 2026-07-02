/**
 * backend/src/scripts/worker-health.js
 *
 * Lightweight Redis connectivity probe used by Docker's HEALTHCHECK
 * in the worker container. The worker has no HTTP server, so we verify
 * health by pinging the Redis instance BullMQ depends on.
 *
 * Exits 0 (healthy) if Redis responds to PING within 5 seconds.
 * Exits 1 (unhealthy) on timeout, connection refused, or auth failure.
 *
 * Build output: dist/scripts/worker-health.js
 * Referenced in: backend/Dockerfile.worker HEALTHCHECK directive
 */

"use strict";

const net = require("net");

const host = process.env.REDIS_HOST || "localhost";
const port = parseInt(process.env.REDIS_PORT || "6379", 10);
const password = process.env.REDIS_PASSWORD || "";
const TIMEOUT_MS = 5000;

const socket = net.createConnection({ host, port });
let done = false;

const finish = (code) => {
    if (done) return;
    done = true;
    socket.destroy();
    process.exit(code);
};

const timer = setTimeout(() => {
    console.error(`[worker-health] Timed out connecting to Redis ${host}:${port}`);
    finish(1);
}, TIMEOUT_MS);

socket.on("connect", () => {
    // Send AUTH if a password is configured, otherwise just PING
    if (password) {
        socket.write(`*2\r\n$4\r\nAUTH\r\n$${password.length}\r\n${password}\r\n`);
    }
    socket.write("*1\r\n$4\r\nPING\r\n");
});

socket.on("data", (data) => {
    const response = data.toString();
    // Accept +OK (AUTH response) or +PONG
    if (response.includes("+OK") || response.includes("+PONG")) {
        clearTimeout(timer);
        console.log(`[worker-health] Redis ${host}:${port} OK`);
        finish(0);
    } else if (response.includes("-")) {
        console.error(`[worker-health] Redis error: ${response.trim()}`);
        clearTimeout(timer);
        finish(1);
    }
});

socket.on("error", (err) => {
    console.error(`[worker-health] Connection error: ${err.message}`);
    clearTimeout(timer);
    finish(1);
});