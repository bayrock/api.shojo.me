import get from "../../modules/get.js";
import endpoints from "../../public/endpoints.json";

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
        if (!req.query.file || !endpoints.includes(req.query.file))
            throw new Error("file not found");

        const type = req.query.type || ".json";
        const data = await get(`${req.query.file}${type}`);

        res.setHeader("Content-Type", `application/${type.slice(1)}`);
        res.setHeader(
            "Cache-Control",
            `public, max-age=${CLIENT_CACHE_LIMIT}, s-maxage=${SERVER_CACHE_LIMIT}`
        );

        return res.status(200).send(data);
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            error: `Failed to fetch ${req.query.file || "null"}${req.query.type || ".json"} from blob ❎`,
            message: err.message
        });
    }
}
