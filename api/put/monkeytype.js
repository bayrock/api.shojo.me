import { get, put } from "@vercel/blob";

const FILENAME = "monkeytype.json"
const UID = "wwezGtenkPeTFJTioEK0KZcXWXq1";
const API = `https://api.monkeytype.com/users/${UID}/profile?isUid`
const RATE_LIMIT = Math.floor(Number(process.env.RATE_LIMIT_MS))


const isAdmin = (req) => req.query.key == process.env.REFRESH_KEY;

export default async function handler(req, res) {
    try {
        // Rate limiting
        let lastTimestamp = 0;
        try {
            const blob = await get(FILENAME);
            const data = await blob.json();
            lastTimestamp = data.timestamp || 0;
        } catch(err) {
            console.error(err);
        }

        const now = Date.now();
        const lastRefresh = now - lastTimestamp;
        if (lastRefresh < RATE_LIMIT && !isAdmin(req)) {
            return res.status(429).json({ error: `${FILENAME} is up-to-date ❎` });
        }

        // Fetch Monkeytype API
        const qwertyRes = await fetch(API);
        if (!qwertyRes.ok) {
            return res.status(500).json({ error: `Failed to fetch ${API} ❎` });
        }

        const qwertyJson = await qwertyRes.json();
        const output = {
            qwerty: {
                stats: qwertyJson.data.typingStats,
                bests: qwertyJson.data.personalBests
            },
            timestamp: now
        };

        // Upload monkeytype.json
        const { url } = await put(FILENAME, JSON.stringify(output, null, 2), {
            access: "public",
            contentType: "application/json",
            token: process.env.BLOB_READ_WRITE_TOKEN
        });

        return res.status(200).json({ 
            message: `${FILENAME} refreshed ✅`,
            blob: url
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: `Failed to refresh ${FILENAME} ❎` });
    }
}
