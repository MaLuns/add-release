import * as glob from "glob";
import { statSync, readFileSync } from "fs";


export interface Config {
    github_token: string;
    github_ref: string;
    github_repository: string;
    // user provided
    input_name?: string;
    input_tag_name?: string;
    input_repository?: string;
    input_body?: string;
    input_body_path?: string;
    input_files?: string[];
    input_draft?: boolean;
    input_prerelease?: boolean;
    input_target_commitish?: string;
    input_generate_release_notes?: boolean;
}

type Env = { [key: string]: string | undefined };

export const parseInputFiles = (files: string): string[] => {
    return files.split(/\r?\n/).reduce<string[]>(
        (acc, line) => acc
            .concat(line.split(","))
            .filter((pat) => pat)
            .map((pat) => pat.trim()),
        []
    );
};

/**
 * 格式化配置
 * @param env 
 * @returns 
 */
export const parseConfig = (env: Env): Config => {
    return {
        github_token: env.GITHUB_TOKEN || env.INPUT_TOKEN || "",
        github_ref: env.GITHUB_REF || "",
        github_repository: env.INPUT_REPOSITORY || env.GITHUB_REPOSITORY || "",
        input_name: env.INPUT_NAME,
        input_tag_name: env.INPUT_TAG_NAME?.trim(),
        input_body: env.INPUT_BODY,
        input_body_path: env.INPUT_BODY_PATH,
        input_files: parseInputFiles(env.INPUT_FILES || ""),
        input_draft: env.INPUT_DRAFT ? env.INPUT_DRAFT === "true" : undefined,
        input_prerelease: env.INPUT_PRERELEASE ? env.INPUT_PRERELEASE == "true" : undefined,
        input_target_commitish: env.INPUT_TARGET_COMMITISH || undefined,
        input_generate_release_notes: env.INPUT_GENERATE_RELEASE_NOTES == "true",
    };
};


export const unmatchedPatterns = (patterns: string[]): string[] => {
    return patterns.reduce((acc: string[], pattern: string): string[] => {
        return acc.concat(
            glob.sync(pattern).filter((path) => statSync(path).isFile()).length == 0
                ? [pattern]
                : []
        );
    }, []);
};

/**
 * 判断是否时 tag
 * @param ref 
 * @returns 
 */
export const isTag = (ref: string): boolean => {
    return ref.startsWith("refs/tags/");
};

/**
 * 获取发布说明
 * @param config 
 * @returns 
 */
export const releaseBody = (config: Config): string | undefined => {
    return (
        (config.input_body_path && readFileSync(config.input_body_path).toString("utf8")) ||
        config.input_body
    );
};

/**
 * 匹配文件路径
 * @param patterns 
 * @returns 
 */
export const paths = (patterns: string[]): string[] => {
    return patterns.reduce((acc: string[], pattern: string): string[] => {
        return acc.concat(
            glob.sync(pattern).filter((path) => statSync(path).isFile())
        );
    }, []);
};

/**
 * 上传弟子
 * @param url 
 * @returns 
 */
export const uploadUrl = (url: string): string => {
    const templateMarkerPos = url.indexOf("{");
    if (templateMarkerPos > -1) {
        return url.substring(0, templateMarkerPos);
    }
    return url;
};