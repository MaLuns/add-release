
import { isTag, parseConfig, paths, unmatchedPatterns, uploadUrl } from "./util";
import { setFailed, setOutput } from "@actions/core";
import { env } from "process";
import { getOctokit } from "@actions/github";
import { createRelease, GitHubReleaser, upload } from "./releaser";

async function run() {
    try {
        const config = parseConfig(env);

        // 校验 tag
        if (!config.input_tag_name && !isTag(config.github_ref) && !config.input_draft) {
            throw new Error(`⚠️ GitHub Releases requires a tag`);
        }

        // 校验 上传文件
        if (config.input_files) {
            const patterns = unmatchedPatterns(config.input_files);
            patterns.forEach((pattern) =>
                console.warn(`🤔 Pattern '${pattern}' does not match any files.`)
            );
            if (patterns.length > 0) {
                throw new Error(`⚠️ There were unmatched files`);
            }
        }

        // 初始化 Github 
        const gh = getOctokit(config.github_token, {
            //new oktokit(
            throttle: {
                onRateLimit: (retryAfter, options) => {
                    console.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                    if (options.request.retryCount === 0) {
                        // only retries once
                        console.log(`Retrying after ${retryAfter} seconds!`);
                        return true;
                    }
                },
                onAbuseLimit: (retryAfter, options) => {
                    // does not retry, only logs a warning
                    console.warn(`Abuse detected for request ${options.method} ${options.url}`);
                },
            },
        });

        // 创建 Release
        const rel = await createRelease(config, new GitHubReleaser(gh))

        // 上传文件
        if (config.input_files) {
            const files = paths(config.input_files);

            if (files.length == 0) {
                console.warn(`🤔 ${config.input_files} not include valid file.`);
            }
            const currentAssets = rel.assets;
            const assets = await Promise.all(
                files.map(async (path) => {
                    const json = await upload(
                        config,
                        gh,
                        uploadUrl(rel.upload_url),
                        path,
                        currentAssets
                    );
                    delete json.uploader;
                    return json;
                })
            ).catch((error) => {
                throw error;
            });
            setOutput("assets", assets);
        }
        console.log(`🎉 Release ready at ${rel.html_url}`);
        setOutput("url", rel.html_url);
        setOutput("id", rel.id.toString());
        setOutput("upload_url", rel.upload_url);
    } catch (error) {
        setFailed(error.message);
    }
}

run();