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
    }
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

export const creatMarkDown = (notes: Notes[]): string | undefined => {
    let md: string[] = []
    notes.forEach(item => {
        md.push(`### ${item.title}`, ...item.list.map(i => `- ${i.message}   ${i.committer ? '@' + i.committer : ''}`))
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
        const startTag = tags[0]
        const endTag = tags[1] || { commit: { sha: '' } }

        const getCommitUpToSha = async (sha: string, per_page: number = 50, page: number = 1): Promise<Array<Commit>> => {
            let { data } = await commiter.getCommits({ owner, repo, per_page, page, sha: config.github_branch || undefined })
            let index = data.findIndex(item => item.sha === sha)
            if (index) {
                return data.slice(0, index)
            } else {
                return data.concat(await getCommitUpToSha(sha, per_page, page + 1))
            }
        }

        console.log(`👩‍🏭 Pull the branch ${config.github_branch} commit record ...`);
        const commits = await getCommitUpToSha(endTag.commit.sha)

        const tag_commits: Commit[] = []
        let flag = false
        for (let index = 0; index < commits.length; index++) {
            const element = commits[index];
            if (flag) {
                if (element.sha === endTag.commit.sha) {
                    break;
                }
                tag_commits.push(element)
            }

            if (element.sha === startTag.commit.sha) {
                flag = true
                tag_commits.push(element)
            }
        }

        const releaseNotes: Notes[] = []
        config.input_generate_release_notes_by_commit_rules?.forEach(rule => {
            let reg = RegExp(rule.rule)
            let notes: NoteItem[] = []
            tag_commits.forEach(commit => {
                if (commit.commit.message && reg.test(commit.commit.message)) {
                    notes.push({
                        committer: commit.commit.committer?.name,
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

        return creatMarkDown(releaseNotes)
    }
    return;
}