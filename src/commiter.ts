import { GitHub } from "@actions/github/lib/utils";
import { Config } from "./util";

type GitHub = InstanceType<typeof GitHub>;

export interface Commit {
    sha: string
    node_id: string
    html_url: string
    commit: {
        author: {
            name?: string | undefined;
            email?: string | undefined;
            date?: string | undefined;
        } | null
        committer: {
            name?: string | undefined;
            email?: string | undefined;
            date?: string | undefined;
        } | null
        url: string
        message: string | undefined
        comment_count: number
    },
    committer: {
        login: string | undefined
    } | null
}

export interface Tag {
    name: string
    zipball_url: string
    tarball_url: string
    commit: {
        sha: string
        url: string
    },
    node_id: string
}
export interface NoteItem {
    url: string
    committer?: string | undefined
    message: string
}
export interface Notes {
    title: string
    list: NoteItem[]
}

export interface Commiter {

    getTags(params: {
        owner: string;
        repo: string;
    }): Promise<{ data: Array<Tag> }>

    getCommits(params: {
        owner: string;
        repo: string;
        sha?: string;
        per_page?: number;
        page?: number;
    }): Promise<{ data: Array<Commit> }>
}

export class GitHubCommiter implements Commiter {
    github: GitHub;

    constructor(github: GitHub) {
        this.github = github;
    }

    getTags(params: { owner: string; repo: string; }): Promise<{ data: Array<Tag>; }> {
        return this.github.rest.repos.listTags(params);
    }

    getCommits(params: {
        owner: string;
        repo: string;
        sha?: string;
        per_page?: number;
        page?: number;
    }): Promise<{ data: Commit[]; }> {
        return this.github.rest.repos.listCommits(params)
    }
}

/**
 * 生成 Markdown
 * @param config 
 * @param notes 
 * @returns 
 */
export const creatMarkDown = (config: Config, notes: Notes[]): string | undefined => {
    const [owner, repo] = config.github_repository.split("/");
    const issue = (owner: string, repo: string, num: number) => `https://github.com/${owner}/${repo}/issues/${num}`
    const issuseMd = (str: string) => str.replace(/(#([0-9]{1,}))/g, (match, p1, p2) => {
        return `([${p1}](${issue(owner, repo, p2)}))`
    })

    let md: string[] = []

    notes.forEach(item => {
        md.push(`### ${item.title}`, ...item.list.map(i => `- ${issuseMd(i.message)}  ${i.committer ? '@' + i.committer : ''}`))
    })
    return md.join('\n')
}

/**
 * 根据提交记录生成发布说明
 * @param config 
 * @param gh 
 * @returns 
 */
export const getReleaseNotes = async (config: Config, gh: GitHub): Promise<string | undefined> => {
    const commiter = new GitHubCommiter(gh)
    const [owner, repo] = config.github_repository.split("/");

    const { data: tags } = await commiter.getTags({ owner, repo })

    if (tags.length) {
        type TagsMap = { [key: string]: Tag }
        let tagsMap: TagsMap = {}
        tags.forEach(i => tagsMap[i.commit.sha] = i)

        const getCommitUpToSha = async (tagsMap: TagsMap, isStart: boolean = false, isEnd: boolean = false, per_page: number = 50, page: number = 1): Promise<Commit[]> => {
            const { data } = await commiter.getCommits({ owner, repo, per_page, page, sha: config.github_ref || undefined })
            const list: Commit[] = []

            for (let index = 0; index < data.length; index++) {
                const element = data[index];
                if (isStart) {
                    if (tagsMap[element.sha]) {
                        isEnd = true;
                        console.log(`🎯 next tag: ${element.sha}`);
                        break;
                    }
                    list.push(element)
                } else {
                    if (tagsMap[element.sha]) {
                        isStart = true
                        list.push(element)
                        console.log(`🎯 latest tag: ${tagsMap[element.sha]}`);
                    }
                }
            }
            if (isEnd || data?.length) {
                return list;
            } else {
                return list.concat(await getCommitUpToSha(tagsMap, isStart, isEnd, per_page, page + 1))
            }
        }

        const commits = await getCommitUpToSha(tagsMap)
        console.log(`📚 Submits records: `, commits);

        const releaseNotes: Notes[] = []
        config.input_generate_release_notes_by_commit_rules?.forEach(rule => {
            let reg = RegExp(rule.rule)
            let notes: NoteItem[] = []
            commits.forEach(commit => {
                if (commit.commit.message && reg.test(commit.commit.message)) {
                    notes.push({
                        committer: commit.committer?.login,
                        message: commit.commit.message.split(rule.rule)[1].trim(),
                        url: commit.html_url
                    })
                }
            })
            if (notes.length) {
                releaseNotes.push({
                    title: rule.title,
                    list: notes
                })
            }
        })

        return creatMarkDown(config, releaseNotes)
    }

    return;
}