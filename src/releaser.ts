import fetch from "node-fetch";
import { Config, isTag, releaseBody } from "./util";
import { GitHub } from "@actions/github/lib/utils";
import { statSync, readFileSync } from "fs";
import { getType } from "mime";
import { basename } from "path";
import { getReleaseNotes } from "./commiter";


type GitHub = InstanceType<typeof GitHub>;

export interface ReleaseAsset {
    name: string;
    mime: string;
    size: number;
    data: Buffer;
}

export interface Release {
    id: number;
    upload_url: string;
    html_url: string;
    tag_name: string;
    name: string | null;
    body?: string | null | undefined;
    target_commitish: string;
    draft: boolean;
    prerelease: boolean;
    assets: Array<{ id: number; name: string }>;
}

export interface Releaser {
    github: GitHub;
    /**
     * 根据 Tag 获取 Release
     * @param params 
     */
    getReleaseByTag(params: {
        owner: string;
        repo: string;
        tag: string;
    }): Promise<{ data: Release }>;

    /**
     * 创建 Release
     * @param params 
     */
    createRelease(params: {
        owner: string;
        repo: string;
        tag_name: string;
        name: string;
        body: string | undefined;
        draft: boolean | undefined;
        prerelease: boolean | undefined;
        target_commitish: string | undefined;
        generate_release_notes: boolean | undefined;
    }): Promise<{ data: Release }>;

    /**
     * 获取所有 Release
     * @param params 
     */
    allReleases(params: {
        owner: string;
        repo: string;
    }): AsyncIterableIterator<{ data: Release[] }>;
}

/**
 * Releas 操作
 */
export class GitHubReleaser implements Releaser {
    github: GitHub;

    constructor(github: GitHub) {
        this.github = github;
    }

    getReleaseByTag(params: {
        owner: string;
        repo: string;
        tag: string;
    }): Promise<{ data: Release }> {
        return this.github.rest.repos.getReleaseByTag(params);
    }

    createRelease(params: {
        owner: string;
        repo: string;
        tag_name: string;
        name: string;
        body: string | undefined;
        draft: boolean | undefined;
        prerelease: boolean | undefined;
        generate_release_notes: boolean | undefined;
    }): Promise<{ data: Release }> {
        return this.github.rest.repos.createRelease(params);
    }

    allReleases(params: {
        owner: string;
        repo: string;
    }): AsyncIterableIterator<{ data: Release[] }> {
        const updatedParams = { per_page: 100, ...params };
        return this.github.paginate.iterator(
            this.github.rest.repos.listReleases.endpoint.merge(updatedParams)
        );
    }
}

/**
 * 创建 Release
 * @param config 配置信息
 * @param releaser Releaser
 * @param maxRetries 重试次数
 * @returns 
 */
export const createRelease = async (config: Config, releaser: Releaser, maxRetries: number = 3): Promise<Release> => {
    if (maxRetries <= 0) {
        console.log(`❌ Too many retries. Aborting...`);
        throw new Error("Too many retries.");
    }

    const [owner, repo] = config.github_repository.split("/");
    const tag = config.input_tag_name || (isTag(config.github_ref) ? config.github_ref.replace("refs/tags/", "") : "");

    const generate_release_notes = config.input_generate_release_notes;

    const tag_name = tag;
    const name = config.input_name || tag;
    let body = releaseBody(config);

    if (!body && config.input_generate_by_commit) {
        body = await getReleaseNotes(config, releaser.github)
    }

    const draft = config.input_draft;
    const prerelease = config.input_prerelease;
    const target_commitish = config.input_target_commitish;

    let commitMessage: string = "";
    if (target_commitish) {
        commitMessage = ` using commit "${target_commitish}"`;
    }
    console.log(`👩‍🏭 Creating new GitHub release for tag ${tag_name}${commitMessage}...`);

    try {
        let release = await releaser.createRelease({ owner, repo, tag_name, name, body, draft, target_commitish, prerelease, generate_release_notes, });
        return release.data;
    } catch (error) {
        // presume a race with competing metrix runs
        console.log(`⚠️ GitHub release failed with status: ${error.status}\n${JSON.stringify(error.response.data.errors)}\nretrying... (${maxRetries - 1} retries remaining)`);
        return createRelease(config, releaser, maxRetries - 1);
    }

};

/**
 * 获取资源信息
 * @param path 
 * @returns 
 */
export const asset = (path: string): ReleaseAsset => {
    return {
        name: basename(path),
        mime: mimeOrDefault(path),
        size: statSync(path).size,
        data: readFileSync(path),
    };
};

export const mimeOrDefault = (path: string): string => { return getType(path) || "application/octet-stream"; };

/**
 * 上传文件
 * @param config 配置信息
 * @param github Github 实例
 * @param url 
 * @param path 文件地址
 * @param currentAssets 
 * @returns 
 */
export const upload = async (config: Config, github: GitHub, url: string, path: string, currentAssets: Array<{ id: number; name: string }>): Promise<any> => {
    const [owner, repo] = config.github_repository.split("/");
    const { name, size, mime, data: body } = asset(path);

    const currentAsset = currentAssets.find(({ name: currentName }) => currentName == name);

    // 删除原有文件
    if (currentAsset) {
        console.log(`♻️ Deleting previously uploaded asset ${name}...`);
        await github.rest.repos.deleteReleaseAsset({
            asset_id: currentAsset.id || 1,
            owner,
            repo,
        });
    }

    // 上传文件
    console.log(`⬆️ Uploading ${name}...`);
    const endpoint = new URL(url);
    endpoint.searchParams.append("name", name);
    const resp = await fetch(endpoint, {
        headers: {
            "content-length": `${size}`,
            "content-type": mime,
            authorization: `token ${config.github_token}`,
        },
        method: "POST",
        body,
    });
    const json = await resp.json();

    if (resp.status !== 201) {
        throw new Error(`Failed to upload release asset ${name}. received status code ${resp.status}\n${json.message}\n${JSON.stringify(json.errors)}`
        );
    }
    return json;
};
