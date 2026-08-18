import { XMLParser } from "fast-xml-parser";
import he from "he";
import get from "../../modules/get.js";
import upload from "../../modules/upload.js";
import isAdmin from "../../modules/isAdmin.js";
import setStatus from "../../modules/setStatus.js";

const FILENAME = "letterboxd.json";
const API = "https://letterboxd.com/bayrock/rss/";
const RATE_LIMIT = Number(process.env.RATE_LIMIT_MS);

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

export default async function handler(req, res) {
    try {
        // Rate limiting
        let existing = {
            films: [],
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

        // Fetch RSS feed
        const response = await fetch(API);

        if (!response.ok)
            throw new Error(`letterboxd returned HTTP ${response.status}`);

        const xml = await response.text();
        const feed = parser.parse(xml);
        const items = feed?.rss?.channel?.item ?? [];

        // Normalize films
        const incoming = items
            .filter(item => item["letterboxd:filmTitle"] && item.pubDate)
            .map(item => {
                const description = item.description || "";

                const image = description.match(
                    /<img[^>]+src="([^"]+)"/
                )?.[1] || null;

                return {
                    title: he.decode(item["letterboxd:filmTitle"]) || "",
                    year: Number(item["letterboxd:filmYear"]) || null,
                    url: item.link || null,
                    guid: item.guid || null,
                    watchedDate: item["letterboxd:watchedDate"] || null,
                    rewatch: item["letterboxd:rewatch"] === "Yes",
                    rating: Number(item["letterboxd:memberRating"]) || null,
                    liked: item["letterboxd:memberLike"] === "Yes",
                    tmdbId: item["tmdb:movieId"] || item["tmdb:tvId"] || null,
                    image,
                    timestamp: new Date(item.pubDate).getTime()
                };
            });

        // Merge with existing history
        const history = [
            ...existing.films,
            ...incoming
        ];

        // Deduplicate
        const films = Array.from(
            new Map(
                history.map(film => [
                    film.guid,
                    film
                ])
            ).values()
        ).sort((a, b) => b.timestamp - a.timestamp);

        const discovered = films.length - existing.films.length;

        if (discovered === 0)
            throw new Error(`no new ${FILENAME} data discovered`);

        // Upload letterboxd.json
        const data = {
            films,
            timestamp: now
        };

        const results = await upload(FILENAME, data);

        // Set status
        const { title, timestamp } = films[0];
        const status = await setStatus(`watching ${title}`, timestamp);

        if (status.error)
            console.error(status.error);
        else
            console.log(status.message);

        // Return results
        return res.status(200).json({
            message: results.message,
            discovered: discovered,
            total: films.length,
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
