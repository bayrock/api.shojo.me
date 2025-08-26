import { get } from "@vercel/blob";

export default async function handler(req, res) {
    try {
        const blobData = await get("monkeytype.json");
        const text = await blobData.text();

        res.setHeader("Content-Type", "application/json");
        res.status(200).send(text);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch internal Monkeytype data ❎" });
    }
}
