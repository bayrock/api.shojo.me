import { list } from "@vercel/blob";

const FILENAME = "monkeytype.json";
const CLIENT_CACHE_LIMIT = 60;
const SERVER_CACHE_LIMIT = Math.floor(Number(process.env.RATE_LIMIT_MS) / 1000);

export default async function handler(req, res) {
    try {
        const { blobs } = await list();
        const blob = blobs.find(b => b.pathname === FILENAME);

        if (!blob)
            return res.status(404).json({ error: `${FILENAME} not found in blob ❎` });

        const blobData = await fetch(blob.url);
        const text = await blobData.text();

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", `public, max-age=${CLIENT_CACHE_LIMIT}, s-maxage=${SERVER_CACHE_LIMIT}`);
        res.status(200).send(text);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: `Failed to fetch ${FILENAME} from blob ❎` });
    }
}
