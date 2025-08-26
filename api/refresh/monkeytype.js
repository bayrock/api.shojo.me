import { put } from "@vercel/blob";

export default async function handler(req, res) {
    try {
        // Fetch Monkeytype data
        const qwertyRes = await fetch("https://api.monkeytype.com/users/wwezGtenkPeTFJTioEK0KZcXWXq1/profile?isUid")

        if (!qwertyRes.ok) return res.status(500).json({ error: "Failed to fetch Monkeytype data ❎" });

        const qwertyJson = await qwertyRes.json();

        const output = {
            qwerty: {
                stats: qwertyJson.data.typingStats,
                bests: qwertyJson.data.personalBests
            },
            timestamp: Date.now()
        };

        // Deploy monkeytype.json
        await put("monkeytype.json", JSON.stringify(output, null, 2), {
            access: "public",
            contentType: "application/json"
        });

        return res.status(200).json({ message: "Monkeytype data refreshed ✅" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to refresh Monkeytype data ❎" });
    }
}
