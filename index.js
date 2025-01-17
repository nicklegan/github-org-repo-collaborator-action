const core = require('@actions/core')
const github = require('@actions/github')
const { stringify } = require('csv-stringify/sync')
const arraySort = require('array-sort')
const token = core.getInput('token', { required: false })
const eventPayload = require(process.env.GITHUB_EVENT_PATH)
const org = core.getInput('org', { required: false }) || eventPayload.organization.login
const { owner, repo } = github.context.repo
const { GitHub } = require('@actions/github/lib/utils')
const { createAppAuth } = require('@octokit/auth-app')

const appId = core.getInput('appid', { required: false })
const privateKey = core.getInput('privatekey', { required: false })
const installationId = core.getInput('installationid', { required: false })

const rolePermission = core.getInput('permission', { required: false }) || 'ADMIN'
const committerName = core.getInput('committer-name', { required: false }) || 'github-actions'
const committerEmail = core.getInput('committer-email', { required: false }) || 'github-actions@github.com'
const jsonExport = core.getInput('json', { required: false }) || 'FALSE'
const affil = core.getInput('affil', { required: false }) || 'ALL'
const days = core.getInput('days', { required: false }) || '90'

const to = new Date()
const from = new Date()
from.setDate(to.getDate() - days)

let octokit = null
let id = []

// GitHub App authentication
if (appId && privateKey && installationId) {
  octokit = new GitHub({
    authStrategy: createAppAuth,
    auth: {
      appId: appId,
      privateKey: privateKey,
      installationId: installationId
    }
  })
} else {
  octokit = github.getOctokit(token)
}

// Utility function to introduce a delay
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Orchestrator
;(async () => {
  try {
    const collabsArray = []
    const emailArray = []
    const mergeArray = []
    const memberArray = []
    await orgID()
    await repoNames(collabsArray)
    await ssoCheck(emailArray)
    await membersWithRole(memberArray)
    await mergeArrays(collabsArray, emailArray, mergeArray, memberArray)
    await report(mergeArray)
    if (jsonExport === 'TRUE') {
      await json(mergeArray)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
})()

// Find orgid for organization
async function orgID() {
  try {
    const query = /* GraphQL */ `
      query ($org: String!) {
        organization(login: $org) {
          id
        }
      }
    `
    dataJSON = await octokit.graphql({
      query,
      org
    })

    id = dataJSON.organization.id
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Query all organization repository names
async function repoNames(collabsArray) {
  try {
    let endCursor = null
    const query = /* GraphQL */ `
      query ($owner: String!, $cursorID: String) {
        organization(login: $owner) {
          repositories(first: 50, after: $cursorID) {
            nodes {
              name
              visibility
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `

    let hasNextPage = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        owner: org,
        cursorID: endCursor
      })

      const repos = dataJSON.organization.repositories.nodes.map((repo) => repo)

      hasNextPage = dataJSON.organization.repositories.pageInfo.hasNextPage

      for (const repo of repos) {
        if (hasNextPage) {
          endCursor = dataJSON.organization.repositories.pageInfo.endCursor
        } else {
          endCursor = null
        }
        await collabRole(repo, collabsArray)
        console.log(repo.name)
      }

      // Introduce a delay of 5 seconds between requests
      await sleep(5000)
    } while (hasNextPage)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Query all repository collaborators
async function collabRole(repo, collabsArray) {
  try {
    let endCursor = null
    const query = /* GraphQL */ `
      query ($owner: String!, $id: ID!, $orgRepo: String!, $affil: CollaboratorAffiliation, $cursorID: String, $from: DateTime, $to: DateTime) {
        organization(login: $owner) {
          repository(name: $orgRepo) {
            collaborators(affiliation: $affil, first: 50, after: $cursorID) {
              edges {
                node {
                  login
                  name
                  email
                  organizationVerifiedDomainEmails(login: $owner)
                  createdAt
                  updatedAt
                  updatedAt
                  contributionsCollection(organizationID: $id, from: $from, to: $to) {
                    hasAnyContributions
                    totalCommitContributions
                    totalIssueContributions
                    totalPullRequestContributions
                    totalPullRequestReviewContributions
                    totalRepositoriesWithContributedIssues
                    totalRepositoriesWithContributedCommits
                    totalRepositoriesWithContributedPullRequests
                    totalRepositoriesWithContributedPullRequestReviews
                  }
                }
                permission
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `

    let hasNextPage = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        owner: org,
        id: id,
        orgRepo: repo.name,
        affil: affil,
        from: from,
        to: to,
        cursorID: endCursor
      })

      const roles = dataJSON.organization.repository.collaborators.edges.map((role) => role)

      hasNextPage = dataJSON.organization.repository.collaborators.pageInfo.hasNextPage

      for (const role of roles) {
        if (hasNextPage) {
          endCursor = dataJSON.organization.repository.collaborators.pageInfo.endCursor
        } else {
          endCursor = null
        }

        const login = role.node.login
        const name = role.node.name || ''
        const publicEmail = role.node.email || ''
        const verifiedEmail = role.node.organizationVerifiedDomainEmails ? role.node.organizationVerifiedDomainEmails.join(', ') : ''
        const createdAt = role.node.createdAt.slice(0, 10) || ''
        const updatedAt = role.node.updatedAt.slice(0, 10) || ''
        const permission = role.permission
        const orgRepo = repo.name
        const visibility = repo.visibility

        const activeContrib = role.node.contributionsCollection.hasAnyContributions
        const commitContrib = role.node.contributionsCollection.totalCommitContributions
        const issueContrib = role.node.contributionsCollection.totalIssueContributions
        const prContrib = role.node.contributionsCollection.totalPullRequestContributions
        const prreviewContrib = role.node.contributionsCollection.totalPullRequestReviewContributions
        const repoIssueContrib = role.node.contributionsCollection.totalRepositoriesWithContributedIssues
        const repoCommitContrib = role.node.contributionsCollection.totalRepositoriesWithContributedCommits
        const repoPullRequestContrib = role.node.contributionsCollection.totalRepositoriesWithContributedPullRequests
        const repoPullRequestReviewContrib = role.node.contributionsCollection.totalRepositoriesWithContributedPullRequestReviews

        const sumContrib = commitContrib + issueContrib + prContrib + prreviewContrib + repoIssueContrib + repoCommitContrib + repoPullRequestContrib + repoPullRequestReviewContrib || ''

        if (role.permission === rolePermission) {
          collabsArray.push({ orgRepo, login, name, publicEmail, verifiedEmail, permission, visibility, org, createdAt, updatedAt, activeContrib, sumContrib })
        } else if (rolePermission === 'ALL') {
          collabsArray.push({ orgRepo, login, name, publicEmail, verifiedEmail, permission, visibility, org, createdAt, updatedAt, activeContrib, sumContrib })
        }
      }

      // Introduce a delay of 5 seconds between requests
      await sleep(5000)
    } while (hasNextPage)
  } catch (error) {}
}

// Check if the organization has SSO enabled
async function ssoCheck(emailArray) {
  try {
    const query = /* GraphQL */ `
      query ($org: String!) {
        organization(login: $org) {
          samlIdentityProvider {
            id
          }
        }
      }
    `

    dataJSON = await octokit.graphql({
      query,
      org: org
    })

    if (dataJSON.organization.samlIdentityProvider) {
      await ssoEmail(emailArray)
    } else {
      // do nothing
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Retrieve all members of a SSO enabled organization
async function ssoEmail(emailArray) {
  try {
    let paginationMember = null

    const query = /* GraphQL */ `
      query ($org: String!, $cursorID: String) {
        organization(login: $org) {
          samlIdentityProvider {
            externalIdentities(first: 50, after: $cursorID) {
              totalCount
              edges {
                node {
                  samlIdentity {
                    nameId
                  }
                  user {
                    login
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `

    let hasNextPageMember = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        org: org,
        cursorID: paginationMember
      })

      const emails = dataJSON.organization.samlIdentityProvider.externalIdentities.edges

      hasNextPageMember = dataJSON.organization.samlIdentityProvider.externalIdentities.pageInfo.hasNextPage

      for (const email of emails) {
        if (hasNextPageMember) {
          paginationMember = dataJSON.organization.samlIdentityProvider.externalIdentities.pageInfo.endCursor
        } else {
          paginationMember = null
        }

        if (!email.node.user) continue
        const login = email.node.user.login
        const ssoEmail = email.node.samlIdentity.nameId

        emailArray.push({ login, ssoEmail })
      }

      // Introduce a delay of 5 seconds between requests
      await sleep(5000)
    } while (hasNextPageMember)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Query all organization members
async function membersWithRole(memberArray) {
  try {
    let endCursor = null
    const query = /* GraphQL */ `
      query ($owner: String!, $cursorID: String) {
        organization(login: $owner) {
          membersWithRole(first: 50, after: $cursorID) {
            edges {
              cursor
              node {
                login
              }
              role
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `

    let hasNextPage = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        owner: org,
        cursorID: endCursor
      })

      const members = dataJSON.organization.membersWithRole.edges

      hasNextPage = dataJSON.organization.membersWithRole.pageInfo.hasNextPage

      for (const member of members) {
        if (hasNextPage) {
          endCursor = dataJSON.organization.membersWithRole.pageInfo.endCursor
        } else {
          endCursor = null
        }
        memberArray.push({ login: member.node.login, role: member.role })
      }

      // Introduce a delay of 5 seconds between requests
      await sleep(5000)
    } while (hasNextPage)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Append SSO email and org members by login key
async function mergeArrays(collabsArray, emailArray, mergeArray, memberArray) {
  try {
    collabsArray.forEach((collab) => {
      const login = collab.login
      const name = collab.name
      const publicEmail = collab.publicEmail
      const verifiedEmail = collab.verifiedEmail
      const permission = collab.permission
      const visibility = collab.visibility
      const org = collab.org
      const orgRepo = collab.orgRepo
      const createdAt = collab.createdAt
      const updatedAt = collab.updatedAt
      const activeContrib = collab.activeContrib
      const sumContrib = collab.sumContrib

      const ssoEmail = emailArray.find((email) => email.login === login)
      const ssoEmailValue = ssoEmail ? ssoEmail.ssoEmail : ''

      const member = memberArray.find((member) => member.login === login)
      const memberValue = member ? member.role : 'OUTSIDE COLLABORATOR'

      ssoCollab = { orgRepo, visibility, login, name, ssoEmailValue, publicEmail, verifiedEmail, permission, org, createdAt, updatedAt, activeContrib, sumContrib, memberValue }

      mergeArray.push(ssoCollab)
    })
    console.log(JSON.stringify(emailArray))
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Create and push CSV report for all organization collaborators
async function report(mergeArray) {
  try {
    const columns = {
      orgRepo: 'Repository',
      visibility: 'Repo Visibility',
      login: 'Username',
      name: 'Full name',
      ssoEmailValue: 'SSO email',
      verifiedEmail: 'Verified email',
      publicEmail: 'Public email',
      permission: 'Repo permission',
      memberValue: 'Organization role',
      activeContrib: 'Active contributions',
      sumContrib: 'Total contributions',
      createdAt: 'User created',
      updatedAt: 'User updated',
      org: 'Organization'
    }

    const sortArray = arraySort(mergeArray, 'orgRepo')

    const csv = stringify(sortArray, {
      header: true,
      columns: columns,
      cast: {
        boolean: function (value) {
          return value ? 'TRUE' : 'FALSE'
        }
      }
    })

    const reportPath = `reports/${org}-${affil}-${rolePermission}-report.csv`
    const opts = {
      owner,
      repo,
      path: reportPath,
      message: `${new Date().toISOString().slice(0, 10)} repo collaborator report`,
      content: Buffer.from(csv).toString('base64'),
      committer: {
        name: committerName,
        email: committerEmail
      }
    }

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: reportPath
      })

      if (data && data.sha) {
        opts.sha = data.sha
      }
    } catch (err) {}

    await octokit.rest.repos.createOrUpdateFileContents(opts)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Create and push optional JSON report for all organization collaborators
async function json(mergeArray) {
  try {
    const json = arraySort(mergeArray, 'orgRepo')

    const reportPath = `reports/${org}-${affil}-${rolePermission}-report.json`
    const opts = {
      owner,
      repo,
      path: reportPath,
      message: `${new Date().toISOString().slice(0, 10)} repo collaborator report`,
      content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
      committer: {
        name: committerName,
        email: committerEmail
      }
    }

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: reportPath
      })

      if (data && data.sha) {
        opts.sha = data.sha
      }
    } catch (err) {}

    await octokit.rest.repos.createOrUpdateFileContents(opts)
  } catch (error) {
    core.setFailed(error.message)
  }
}
