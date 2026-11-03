// GitHub delays and drops scheduled workflow runs, so this Worker starts the deploy workflow on Cloudflare's cron
// instead. The workflow's own schedule runs later as a backup; an extra run with no new scores commits nothing.
const DEPLOY_CRON = "17 8 * * *";

async function dispatch(env, workflow) {
  const response = await fetch(
    `https://api.github.com/repos/${env.REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": "swishrank-cron",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub refused to start ${workflow}: ${response.status} ${await response.text()}`);
  }
}

const easternDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

// The report only matters to games still to tip off, so a day with none left costs one ESPN request and no Action.
// Reading the report's PDF here to start the Action only on a changed report would take more CPU than the Workers
// Free plan's 10 ms.
async function gamesLeft(now) {
  const day = easternDay.format(now).replaceAll("-", "");
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${day}`);
  if (!response.ok) throw new Error(`ESPN answered ${response.status}`);
  const { events } = await response.json();
  return events.filter((e) => e.status.type.state === "pre" && Date.parse(e.date) > now).length;
}

export default {
  async scheduled(controller, env) {
    if (controller.cron === DEPLOY_CRON) return dispatch(env, "deploy.yml");
    if ((await gamesLeft(controller.scheduledTime)) === 0) return console.log("no game left to tip off today");
    await dispatch(env, "nba-report.yml");
  },
};
