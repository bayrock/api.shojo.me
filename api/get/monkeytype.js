import get from "../../modules/get.js";

const FILENAME = "monkeytype.json";
const CLIENT_CACHE_LIMIT = 60;
const SERVER_CACHE_LIMIT = Math.floor(Number(process.env.RATE_LIMIT_MS) / 1000);

export default async function handler(req, res) {
    try {
        // Add CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") return res.status(200).end();

        // Fetch data
        const data = await get(FILENAME);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", `public, max-age=${CLIENT_CACHE_LIMIT}, s-maxage=${SERVER_CACHE_LIMIT}`);
        return res.status(200).send(data);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: `Failed to fetch ${FILENAME} from blob ❎` });
    }
}
