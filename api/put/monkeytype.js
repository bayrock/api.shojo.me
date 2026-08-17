import get from "../../modules/get.js";
import upload from "../../modules/upload.js";
import isAdmin from "../../modules/isAdmin.js";

const FILENAME = "monkeytype.json"
const UID = "wwezGtenkPeTFJTioEK0KZcXWXq1";
const API = `https://api.monkeytype.com/users/${UID}/profile?isUid`
const RATE_LIMIT = Math.floor(Number(process.env.RATE_LIMIT_MS))

export default async function handler(req, res) {
    try {
        // Rate limiting
        let existing = {};
        try {
            existing = await get(FILENAME);
        } catch(err) {
            console.error(err.message);
        }

        const now = Date.now();
        const lastRefresh = now - existing.timestamp;
        if (lastRefresh < RATE_LIMIT && !isAdmin(req))
            throw new Error("too many requests", { cause: 429 });

        // Fetch Monkeytype API
        const response = await fetch(API);
        if (!response.ok)
            throw new Error(`failed to fetch ${API}`);

        const parsed = await response.json();
        const incoming = parsed.data;

        if (existing.qwerty.stats.startedTests == incoming.typingStats.startedTests)
            throw new Error(`no new ${FILENAME} data discovered`)

        // Upload monkeytype.json
        const data = {
            qwerty: {
                stats: incoming.typingStats,
                bests: incoming.personalBests,
                streak: incoming.streak
            },
            timestamp: now
        };

        const results = await upload(FILENAME, data);

        // Return results
        return res.status(200).json({ 
            message: results.message,
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
