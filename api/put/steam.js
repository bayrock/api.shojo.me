import get from "../../modules/get.js";
import upload from "../../modules/upload.js";
import isAdmin from "../../modules/isAdmin.js";
import setStatus from "../../modules/setStatus.js";

const FILENAME = "steam.json";
const API = "https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/";
const STEAM_ID = "76561198009485546";
const RATE_LIMIT = Number(process.env.RATE_LIMIT_MS);

export default async function handler(req, res) {
    try {
        // Rate limiting
        let existing = {
            games: [],
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

        // Fetch Steam activity
        const url = new URL(API);

        url.searchParams.set("key", process.env.STEAM_API_KEY);
        url.searchParams.set("steamid", STEAM_ID);
        url.searchParams.set("format", "json");

        const response = await fetch(url);

        if (!response.ok)
            throw new Error(`steam returned HTTP ${response.status}`);

        const parsed = await response.json();
        const items = parsed?.response?.items ?? [];

        // Normalize games
        const incoming = items.map(game => ({
            appId: game.appid,
            name: game.name || "",
            playtime: game.playtime_forever || 0,
            playtimeRecent: game.playtime_2weeks || 0,
            image: game.img_logo_url
                ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
                : null
        }));

        // Merge with existing history
        const history = [
            ...existing.games,
            ...incoming
        ];

        // Deduplicate
        const games = Array.from(
            new Map(
                history.map(item => [
                    item.appId,
                    item
                ])
            ).values()
        ).sort((a, b) => b.timestamp - a.timestamp);

        const discovered = games.length - existing.games.length;

        if (discovered === 0)
            throw new Error(`no new ${FILENAME} data discovered`);

        // Upload steam.json
        const data = {
            games: incoming,
            timestamp: now
        };

        const results = await upload(FILENAME, data);

        // Set status
        if (incoming.length) {
            const { name } = incoming[0];
            const status = await setStatus(`playing ${name}`, now);

            if (status.error)
                console.error(status.error);
            else
                console.log(status.message);
        }

        // Return results
        return res.status(200).json({
            message: results.message,
            discovered: discovered,
            total: incoming.length,
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
