import { createClient } from "redis";

export type State = {
    state: "idle" | "review" | "error" | "suggestion";
}

export class MemoryStorage {
    private storage: Map<string, string> | ReturnType<typeof createClient>;

    private constructor(storage: Map<string, string> | ReturnType<typeof createClient>) {
        this.storage = storage;
    }

    static async new() {
        const redisUrl = process.env.REDIS_URL;

        if (!redisUrl) {
            console.log("Redis URL not found, using memory storage");
            return new MemoryStorage(new Map());
        }

        try {
            const redisClient = createClient({ url: redisUrl });
            await redisClient.connect();
            console.log("Redis connected");
            return new MemoryStorage(redisClient);
        } catch (error) {
            console.log("Redis connection error, using memory storage", error);
            return new MemoryStorage(new Map());
        }
    }

    async get(key: string): Promise<State | undefined> {
        const value = await this.storage.get(key);

        if (!value) {
            return undefined;
        }

        return JSON.parse(value);
    }

    async set(key: string, value: State): Promise<void> {
        await this.storage.set(key, JSON.stringify(value));
    }

    async delete(key: string): Promise<void> {
        if (this.storage instanceof Map) {
            this.storage.delete(key);
        } else {
            await this.storage.del(key);
        }
    }
}