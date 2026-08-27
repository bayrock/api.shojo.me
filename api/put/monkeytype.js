import get from "../../modules/get.js";
import upload from "../../modules/upload.js";
import isAdmin from "../../modules/isAdmin.js";

const FILENAME = "monkeytype.json";
const UID = "wwezGtenkPeTFJTioEK0KZcXWXq1";
const API = `https://api.monkeytype.com/users/${UID}/profile?isUid`;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_MS);

function parseKeyboard(raw) {
    const lines = String(raw ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const [model, switches, layoutRaw] = lines;

    return {
        model: model || "Apple Magic",
        switches: switches || "Scissor",
        layout: layoutRaw || "QWERTY"
    };
}

export default async function handler(req, res) {
    try {
        // Rate limiting
        let existing = {
            qwerty: {
                stats: { completedTests: 0, startedTests: 0, timeTyping: 0 },
                bests: {},
                streak: 0,
                maxStreak: 0
            },
            profile: {
                name: null,
                xp: 0,
                keyboard: { model: null, switches: null, layout: null }
            },
            timestamp: 0
        };

        try {
            existing = await get(FILENAME);
        } catch (err) {
            console.error(err.message);
        }

        const now = Date.now();

        if (now - existing.timestamp < RATE_LIMIT && !isAdmin(req))
            throw new Error("too many requests", { cause: 429 });

        // Fetch Monkeytype API
        const response = await fetch(API);

        if (!response.ok)
            throw new Error(`monkeytype returned HTTP ${response.status}`);

        const parsed = await response.json();
        const incoming = parsed.data;

        const previousStarted = existing.qwerty?.stats?.startedTests ?? 0;
        const newStarted = incoming.typingStats.startedTests;

        if (previousStarted === newStarted)
            throw new Error(`no new ${FILENAME} data discovered`);

        // Upload monkeytype.json
        const data = {
            qwerty: {
                stats: incoming.typingStats,
                bests: incoming.personalBests,
                streak: incoming.streak,
                maxStreak: incoming.maxStreak
            },
            profile: {
                name: incoming.name || null,
                xp: incoming.xp || 0,
                keyboard: parseKeyboard(incoming.details?.keyboard)
            },
            timestamp: now
        };

        const results = await upload(FILENAME, data);

        // Return results
        return res.status(200).json({
            message: results.message,
            discovered: newStarted - previousStarted,
            total: newStarted,
            blob: results.blob
        });
    } catch (err) {
        console.error(err);

        return res.status(err.cause || 500).json({
            error: `Failed to refresh ${FILENAME} ❎`,
            message: err.message
        });
    }
}
