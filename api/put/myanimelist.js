import { XMLParser } from "fast-xml-parser";
import he from "he";
import get from "../../modules/get.js";
import upload from "../../modules/upload.js";
import isAdmin from "../../modules/isAdmin.js";
import setStatus from "../../modules/setStatus.js";

const FILENAME = "myanimelist.json";
const API = "https://myanimelist.net/rss.php?type=rw&u=Bayrock";
const ANILIST_URL = "https://graphql.anilist.co";
const RATE_LIMIT = Number(process.env.RATE_LIMIT_MS);

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

const COVER_QUERY = `
    query ($idMal: Int) {
        Media(idMal: $idMal, type: ANIME) {
            coverImage { large }
        }
    }
`;

async function getAniListCover(malId) {
    try {
        const res = await fetch(ANILIST_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ query: COVER_QUERY, variables: { idMal: malId } })
        });

        // Back off preemptively if we're close to whatever limit is currently enforced
        const remaining = Number(res.headers.get("x-ratelimit-remaining"));
        if (!Number.isNaN(remaining) && remaining <= 1) {
            await new Promise((r) => setTimeout(r, 2000));
        }

        if (res.status === 429) {
            const retryAfter = Number(res.headers.get("retry-after")) || 5;
            await new Promise((r) => setTimeout(r, retryAfter * 1000));
            return null; // skip for this cycle, picked up again next refresh
        }

        if (!res.ok) return null;

        const { data } = await res.json();
        return data?.Media?.coverImage?.large ?? null;
    } catch (err) {
        console.error(`anilist lookup failed for MAL id ${malId}:`, err.message);
        return null;
    }
}

export default async function handler(req, res) {
    try {
        // Rate limiting
        let existing = {
            anime: [],
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
            throw new Error(`myanimelist returned HTTP ${response.status}`);

        const xml = await response.text();
        const feed = parser.parse(xml);
        const items = feed?.rss?.channel?.item ?? [];

        // Normalize anime (sequentially for AniList)
        const validItems = items.filter(item => item.title && item.guid && item.pubDate);
        const incoming = [];

        for (const item of validItems) {
            const [ title, type ] = he.decode(String(item.title)).split(" - ");

            const [ status, progress ] = he.decode(String(item.description)).split(" - ");
            const [ watched, total ] = progress.replace(" episodes", "").split(" of ");

            const malId = String(item.guid).match(/\/anime\/(\d+)/)?.[1];
            const image = malId ? await getAniListCover(Number(malId)) : null;

            incoming.push({
                title,
                type,
                url: item.link || null,
                guid: item.guid || null,
                status: status || null,
                episodesWatched: watched
                    ? Number(watched)
                    : null,
                episodesTotal: total
                    ? Number(total)
                    : null,
                image,
                timestamp: new Date(item.pubDate).getTime()
            });
        }

        // Merge with existing history
        const history = [
            ...existing.anime,
            ...incoming
        ];

        // Deduplicate
        const anime = Array.from(
            new Map(
                history.map(item => [
                    item.guid,
                    item
                ])
            ).values()
        ).sort((a, b) => b.timestamp - a.timestamp);

        const discovered = anime.length - existing.anime.length;

        if (discovered === 0)
            throw new Error(`no new ${FILENAME} data discovered`);

        // Upload myanimelist.json
        const data = {
            anime,
            timestamp: now
        };

        const results = await upload(FILENAME, data);

        // Set status
        const { title, timestamp } = anime[0];
        const status = await setStatus(`watching ${title}`, timestamp);

        if (status.error)
            console.error(status.error);
        else
            console.log(status.message);

        // Return results
        return res.status(200).json({
            message: results.message,
            discovered,
            total: anime.length,
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
