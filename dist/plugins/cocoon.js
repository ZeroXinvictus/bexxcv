import * as fs from "node:fs";
import * as path from "node:path";
export function cocoon(input) {
    const options = typeof input === "string" ? { dir: input } : input;
    return {
        name: "cocoon",
        order: 5,
        beforeLaunch(launch) {
            const dir = path.resolve(options.dir);
            const current = launch.user_data_dir;
            if (typeof current === "string" && path.resolve(current) !== dir) {
                throw new Error('cocoon and user_data_dir point to different folders, set only one of them');
            }
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            launch.user_data_dir = dir;
        },
    };
}
