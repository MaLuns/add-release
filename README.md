# Add-RELEASE

自动生成 release，个人使用，请勿直接使用。

## 参数

| 名称                       | 类型    | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------- | ----------------------------------------- |
| `body`                     | String  | 发布版本说明 |
| `body_path`                | String  | 指定发布版本说明文件 |
| `draft`                    | Boolean | 是否是草稿版 |
| `prerelease`               | Boolean | 是否是预览版 |
| `files`                    | String  | 以换行符分隔的资源路径glob，以上传发布 |
| `name`                     | String  | 版本名称。默认为标签名 |
| `tag_name`                 | String  | 标签名。默认为' github.ref ' |
| `repository`               | String  | `<owner>/<repo>` 格式的目标存储库名称。默认为GITHUB_REPOSITORY env变量 |
| `target_commitish`         | String  | 决定使用哪个提交节点 ，可以是任何分支或提交 SHA ，默认为存储库默认分支 |
| `token`                    | String  | GitHub个人访问令牌。默认为 `${{ github.token }}` |
| `generate_release_notes`   | Boolean | 是否自动生成此版本的名称和主体。如果指定了name，则使用指定的名称;否则，将自动生成一个名称。如果指定了body，则正文将预先挂载到自动生成的注释中。有关更多信息，请参阅 [GitHub docs for this feature](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes) |

💡当同时提供 `body` 和 `body_path` 时，`body_path` 将是首先尝试，如果路径不能读取然后退回到 `body` 。
