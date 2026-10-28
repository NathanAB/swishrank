// GitHub delays and drops scheduled workflow runs, so this Worker starts the deploy workflow on Cloudflare's cron
// instead. The workflow's own schedule runs later as a backup; an extra run with no new scores commits nothing.
export default {
  async scheduled(controller, env) {
    const response = await fetch(
      `https://api.github.com/repos/${env.REPO}/actions/workflows/deploy.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "User-Agent": "nba-elo-cron",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub refused the dispatch: ${response.status} ${await response.text()}`);
    }
  },
};
