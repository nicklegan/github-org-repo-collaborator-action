# GitHub Organization Repository Collaborator Action

> A GitHub Action to generate a report which contains repository collaborator details for a GitHub organization.

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
        uses: actions/checkout@v4

      - name: Get repo collaborator report
        uses: nicklegan/github-org-repo-collaborator-action@v2.0.1
        with:
          token: ${{ secrets.ORG_TOKEN }}
        # org: ''
        # affil: 'ALL'
        # permission: 'ADMIN'
        # days: '90'
        # json: 'FALSE'
        # appid: ${{ secrets.APPID }}
        # privatekey: ${{ secrets.PRIVATEKEY }}
        # installationid: ${{ secrets.INSTALLATIONID }}
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

If the organization name in the workflow is left blank, the Action will generate a report for the organization the workflow is located in.

| Name              | Description                                                         | Default                     | Options        | Required |
| :---------------- | :------------------------------------------------------------------ | :-------------------------- | :------------- | :------- |
| `org`             | Organization different than the default workflow context            |                             | [workflow.yml] | `false`  |
| `permission`      | Permission to query for (ADMIN, MAINTAIN, WRITE, TRIAGE, READ, ALL) | `ADMIN`                     | [workflow.yml] | `false`  |
| `affil`           | Collaborator type to query for (ALL, DIRECT, OUTSIDE)               | `ALL`                       | [workflow.yml] | `false`  |
| `days`            | Amount of days to look back for contributions                       | `90`                        | [workflow.yml] | `false`  |
| `json`            | Export an additional report in JSON format                          | `FALSE`                     | [workflow.yml] | `false`  |
| `committer-name`  | The name of the committer that will appear in the Git history       | `github-actions`            | [action.yml]   | `false`  |
| `committer-email` | The committer email that will appear in the Git history             | `github-actions@github.com` | [action.yml]   | `false`  |

[workflow.yml]: #Usage 'Usage'
[action.yml]: action.yml 'action.yml'

## CSV layout

| Column               | Description                                                                         |
| :------------------- | :---------------------------------------------------------------------------------- |
| Repository           | Repository the user is a collaborator of                                            |
| Repo Visibility      | Private, public or internal repository visibility                                   |
| Username             | GitHub username                                                                     |
| Full name            | GitHub profile name                                                                 |
| SSO email            | GitHub NameID email (only available if org SSO setting is enabled)                  |
| Verified email       | GitHub verified domain email                                                        |
| Public email         | GitHub account email                                                                |
| Repo permission      | Repository permissions for the user                                                 |
| Organization role    | Whether the user is a member, admin (org owner) or outside collaborator             |
| Active contributions | If the user made contributions during the set interval                              |
| Total contributions  | Total number of organization contributions made by the user during the set interval |
| User created         | Date the user account was created                                                   |
| User updated         | Date the user account settings were last updated                                    |
| Organization         | Organization the repo belongs to                                                    |

:bulb: A CSV report file will be saved in the repository reports folder using the following naming format: **`organization`-`affil`-`permission`-report.csv**.

## GitHub App authentication

As an option you can use GitHub App authentication to generate the report.

[Register](https://docs.github.com/developers/apps/building-github-apps/creating-a-github-app) a new organization/personal owned GitHub App with the below permissions:

| GitHub App Permission                     | Access           |
| :---------------------------------------- | :--------------- |
| `Organization Permissions:Administration` | `read`           |
| `Organization Permissions:Members`        | `read`           |
| `Repository Permissions:Contents`         | `read and write` |
| `User Permissions:Email addresses`        | `read`           |

After registration install the GitHub App to your organization. Store the below App values as secrets.

### GitHub App secrets

| Name             | Value                             | Required |
| :--------------- | :-------------------------------- | :------- |
| `APPID`          | GitHub App ID number              | `true`   |
| `PRIVATEKEY`     | Content of private key .pem file  | `true`   |
| `INSTALLATIONID` | GitHub App installation ID number | `true`   |
