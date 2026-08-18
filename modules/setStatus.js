import { put } from "@vercel/blob";
import get from "./get.js";
import upload from "./upload.js";
const FILENAME = "status.json"

async function setStatus(message, timestamp) {
    try {
        let existing = { message: "", timestamp: 0 };

        try {
            existing = await get(FILENAME);
        } catch (err) {
            console.log(err.message);
        }

        if (existing.timestamp >= timestamp)
            throw new Error(`no new ${FILENAME} data discovered`)

        const data = { message, timestamp };
        return await upload(FILENAME, data);
    } catch (err) {
        console.error(err);
        
        return { 
            error: `Failed to refresh ${FILENAME} ❎`,
            message: err.message
        }
    }
}

export default setStatus;
