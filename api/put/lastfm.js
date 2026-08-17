import { XMLParser } from "fast-xml-parser";
import get from "../../modules/get.js";
import upload from "../../modules/upload.js";
import isAdmin from "../../modules/isAdmin.js";
import setStatus from "../../modules/setStatus.js";

const FILENAME = "lastfm.json";
const API = "https://lfm.xiffy.nl/bayrock";
const RATE_LIMIT = Number(process.env.RATE_LIMIT_MS);

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

export default async function handler(req, res) {
    try {
        // Rate limiting
        let existing = {
            tracks: [],
            timestamp: 0
        };

        try {
            existing = await get(FILENAME);
        } catch (err) {
            console.error(`${FILENAME} does not exist yet`);
        }

        const now = Date.now();

        if (now - (existing.timestamp || 0) < RATE_LIMIT && !isAdmin(req)) {
            return res.status(429).json({
                error: `${FILENAME} is up-to-date ❎`,
                message: "too many requests"
            });
        }

        // Fetch RSS feed
        const response = await fetch(API, {
            headers: { "User-Agent": "shojo.me/lastfm" }
        });

        if (!response.ok)
            throw new Error(`xiffy returned HTTP ${response.status}`);

        const xml = await response.text();
        const feed = parser.parse(xml);
        const items = feed?.rss?.channel?.item ?? [];

        // Normalize tracks
        const incoming = items
            .filter(item => item["lfm:track"] && item.pubDate)
            .map(item => ({
                artist: item["lfm:artist"] || "",
                artistMbid: item["lfm:artist_mbid"] || null,
                track: item["lfm:track"] || "",
                trackUrl: item["lfm:track_url"] || item.link || null,
                mbid: item["lfm:mbid"] || null,
                album: item["lfm:album"] || "",
                albumMbid: item["lfm:album_mbid"] || null,
                libraryTrack: item["lfm:library_track"] || null,
                libraryArtist: item["lfm:library_artist"] || null,
                libraryAlbum: item["lfm:library_album"] || null,
                image: item.enclosure?.["@_url"] || null,
                timestamp: new Date(item.pubDate).getTime()
            }));

        // Merge with existing history
        const history = [
            ...existing.tracks,
            ...incoming
        ];

        // Deduplicate
        const tracks = Array.from(
            new Map(
                history.map(track => [
                    `${track.timestamp}:${track.artist}:${track.track}`,
                    track
                ])
            ).values()
        ).sort((a, b) => b.timestamp - a.timestamp);

        const data = {
            tracks: tracks,
            timestamp: now
        };

        // Upload lastfm.json
        const results = await upload(FILENAME, data);

        // Set status
        const { track, artist, timestamp } = tracks[0];
        const status = await setStatus(`listening to ${track} by ${artist}`, timestamp);
        if (status.error)
            console.error(status.error);
        else
            console.log(status.message);

        // Return results
        return res.status(200).json({
            message: results.message,
            discovered: tracks.length - existing.tracks.length,
            total: tracks.length,
            blob: results.blob
        });
    } catch (err) {
        console.error(err);

        return res.status(500).json({
            error: `Failed to refresh ${FILENAME} ❎`,
            message: err.message
        });
    }
}
