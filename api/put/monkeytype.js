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
        let lastTimestamp = 0;
        try {
            const data = await get(FILENAME);
            lastTimestamp = data.timestamp || 0;
        } catch(err) {
            console.error(err);
        }

        const now = Date.now();
        const lastRefresh = now - lastTimestamp;
        if (lastRefresh < RATE_LIMIT && !isAdmin(req))
            throw new Error("too many requests", { cause: 429 });

        // Fetch Monkeytype API
        const qwertyRes = await fetch(API);
        if (!qwertyRes.ok)
            throw new Error(`failed to fetch ${API}`);

        const qwertyJson = await qwertyRes.json();

        // Upload monkeytype.json
        const data = {
            qwerty: {
                stats: qwertyJson.data.typingStats,
                bests: qwertyJson.data.personalBests,
                streak: qwertyJson.data.streak
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
