import { list } from "@vercel/blob";

async function get(file) {
    const { blobs } = await list();
    const blob = blobs.find(b => b.pathname === file);

    if (!blob) return res.status(404).json({ error: `${file} not found in blob ❎` });

    const blobData = await fetch(blob.url);
    return await blobData.json();
}

export default get;
