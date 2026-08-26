// api/put/goodreads.js
import { XMLParser } from "fast-xml-parser";
import he from "he";
import get from "../../modules/get.js";
import upload from "../../modules/upload.js";
import isAdmin from "../../modules/isAdmin.js";
import setStatus from "../../modules/setStatus.js";

const FILENAME = "goodreads.json";
const API = "https://www.goodreads.com/user/updates_rss/192492256";
const RATE_LIMIT = Number(process.env.RATE_LIMIT_MS);

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

function resolveUrl(path) {
    if (!path) return null;
    try {
        return new URL(path, "https://www.goodreads.com").href;
    } catch {
        return null;
    }
}

function parseDescription(html) {
    const decoded = he.decode(String(html ?? ""));

    const bookUrlMatch = decoded.match(/class="bookTitle"\s+href="([^"]+)"/);
    const titleMatch = decoded.match(/class="bookTitle"[^>]*>([^<]+)</);
    const authorUrlMatch = decoded.match(/class="authorName"\s+href="([^"]+)"/);
    const authorMatch = decoded.match(/class="authorName"[^>]*>([^<]+)</);
    const imageMatch = decoded.match(/<img[^>]*\ssrc="([^"]+)"/);
    const ratingMatch = decoded.match(/gave\s+(\d(?:\.\d)?)\s+stars?\s+to/i);

    const title = titleMatch
        ? he.decode(titleMatch[1]).replace(/\s*\([^)]*\)\s*$/, "").trim()
        : null;

    return {
        title,
        author: authorMatch ? he.decode(authorMatch[1]).trim() : null,
        bookUrl: resolveUrl(bookUrlMatch?.[1]),
        authorUrl: resolveUrl(authorUrlMatch?.[1]),
        image: imageMatch?.[1] ?? null,
        rating: ratingMatch ? Number(ratingMatch[1]) : null
    };
}

function parseStatus(title) {
    const match = he.decode(String(title ?? "")).match(/^Serene (.+?)\s+'/);
    return match ? match[1] : null;
}

export default async function handler(req, res) {
    try {
        // Rate limiting
        let existing = {
            books: [],
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
            throw new Error(`goodreads returned HTTP ${response.status}`);

        const xml = await response.text();
        const feed = parser.parse(xml);
        const items = feed?.rss?.channel?.item ?? [];

        // Normalize books
        const incoming = items
            .filter(item => item.guid && item.pubDate && item.title)
            .map(item => {
                const guid = item.guid?.["#text"] ?? item.guid;
                const status = parseStatus(item.title);
                const details = parseDescription(item.description);

                return {
                    guid,
                    status,
                    title: details.title,
                    author: details.author,
                    bookUrl: details.bookUrl,
                    authorUrl: details.authorUrl,
                    image: details.image,
                    rating: details.rating,
                    reviewUrl: item.link || null,
                    timestamp: new Date(item.pubDate).getTime()
                };
            })
            .filter(book => book.title); // drop anything the regex pass couldn't parse

        // Merge with existing history
        const history = [
            ...existing.books,
            ...incoming
        ];

        // Deduplicate
        const books = Array.from(
            new Map(
                history.map(book => [book.guid, book])
            ).values()
        ).sort((a, b) => b.timestamp - a.timestamp);

        const discovered = books.length - existing.books.length;

        if (discovered === 0)
            throw new Error(`no new ${FILENAME} data discovered`);

        // Upload goodreads.json
        const data = {
            books,
            timestamp: now
        };

        const results = await upload(FILENAME, data);

        // Set status
        const latest = books[0];
        if (latest.status) {
            const status = await setStatus(`${latest.status} ${latest.title}`, latest.timestamp);
            if (status.error)
                console.error(status.error);
            else
                console.log(status.message);
        }

        // Return results
        return res.status(200).json({
            message: results.message,
            discovered,
            total: books.length,
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
