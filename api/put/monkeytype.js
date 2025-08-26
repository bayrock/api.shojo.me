import { put } from "@vercel/blob";

const UID = 'wwezGtenkPeTFJTioEK0KZcXWXq1';

export default async function handler(req, res) {
    try {
        // Fetch Monkeytype data
        const qwertyRes = await fetch(`https://api.monkeytype.com/users/${UID}/profile?isUid`)

        if (!qwertyRes.ok) return res.status(500).json({ error: "Failed to fetch external Monkeytype data ❎" });

        const qwertyJson = await qwertyRes.json();

        const output = {
            qwerty: {
                stats: qwertyJson.data.typingStats,
                bests: qwertyJson.data.personalBests
            },
            timestamp: Date.now()
        };

        // Upload monkeytype.json
        const { url } = await put("monkeytype.json", JSON.stringify(output, null, 2), {
            access: "public",
            contentType: "application/json",
            token: process.env.BLOB_READ_WRITE_TOKEN
        });

        return res.status(200).json({ 
            message: "Monkeytype data refreshed ✅",
            blob: url
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to refresh Monkeytype data ❎" });
    }
}
