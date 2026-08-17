import { put } from "@vercel/blob";

async function upload(file, data) {
    if (!file) throw "upload path is undefined"

    const { url } = await put(file, JSON.stringify(data, null, 2), {
        access: "public",
        contentType: "application/json",
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN
    });

    return { 
        message: `${file} refreshed ✅`,
        blob: url
    }
}

export default upload;
