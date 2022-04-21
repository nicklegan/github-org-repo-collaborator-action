# GitHub Organization Repository Collaborator Action

> A GitHub Action to generate a report which contains all the repo collaborators with Admin permissions per repositiry and their email addresses for a GitHub organization.

## Usage

The example [workflow](https://docs.github.com/actions/reference/workflow-syntax-for-github-actions) below runs on a weekly [schedule](https://docs.github.com/actions/reference/events-that-trigger-workflows#scheduled-events) and can also be executed manually using a [workflow_dispatch](https://docs.github.com/actions/reference/events-that-trigger-workflows#manual-events) event.

```yml
name: Repo Collaborator Action

on:
  workflow_dispatch:
  schedule:
    # Runs on every Sunday at 00:00 UTC
    #
    #        ┌────────────── minute
    #        │ ┌──────────── hour
    #        │ │ ┌────────── day (month)
    #        │ │ │ ┌──────── month
    #        │ │ │ │ ┌────── day (week)
    - cron: '0 0 * * 0'

jobs:
  github-collaborator-report:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - name: Get repo collaborator report
        uses: nicklegan/github-org-repo-collaborator-action@v1.0.0
        with:
          token: ${{ secrets.ORG_TOKEN }}
          org: ''
```

## GitHub secrets

| Name                 | Value                                                             | Required |
| :------------------- | :---------------------------------------------------------------- | :------- |
| `ORG_TOKEN`          | A `user:email`, `repo`, `admin:org`scoped [Personal Access Token] | `true`   |
| `ACTIONS_STEP_DEBUG` | `true` [Enables diagnostic logging]                               | `false`  |

[personal access token]: https://github.com/settings/tokens/new?scopes=admin:org,repo,user:email&description=Repo+Collaborator+Action 'Personal Access Token'
[enables diagnostic logging]: https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-runner-diagnostic-logging 'Enabling runner diagnostic logging'

:bulb: Disable [token expiration](https://github.blog/changelog/2021-07-26-expiration-options-for-personal-access-tokens/) to avoid failed workflow runs when running on a schedule.

:bulb: If the organization has SAML SSO enabled, make sure the personal access token is [authorized](https://docs.github.com/enterprise-cloud@latest/authentication/authenticating-with-saml-single-sign-on/authorizing-a-personal-access-token-for-use-with-saml-single-sign-on) to access the organization.

## Action inputs

If the organization name in the workflow is left blank, the Action will generate a report for the organization the workflow is triggered from.

| Name              | Description                                                   | Default                     | Options        | Required |
| :---------------- | :------------------------------------------------------------ | :-------------------------- | :------------- | :------- |
| `org`             | Organization different than the default workflow context      |                             | [workflow.yml] | `false`  |
| `role`            | The repo collaborator role to query for                       | `ADMIN`                     | [action.yml]   | `false`  |
| `committer-name`  | The name of the committer that will appear in the Git history | `github-actions`            | [action.yml]   | `false`  |
| `committer-email` | The committer email that will appear in the Git history       | `github-actions@github.com` | [action.yml]   | `false`  |

[workflow.yml]: #Usage 'Usage'
[action.yml]: action.yml 'action.yml'

## CSV layout

| Column          | Description                                                        |
| :-------------- | :----------------------------------------------------------------- |
| Repository      | Repo the user is an admin of                                       |
| Repo Visibility | Private, public or internal visibility                             |
| Username        | GitHub username                                                    |
| Full name       | GitHub profile name                                                |
| SSO email       | GitHub NameID email (only available if org SSO setting is enabled) |
| Verified email  | GitHub verified domain email                                       |
| Public email    | GitHub account email                                               |
| Role            | Repository role                                                    |
| Organization    | Org the repo is part of                                            |

A CSV report file will be saved in the repository reports folder using the following naming format: **`organization`-repo-collaborator-report.csv**.
