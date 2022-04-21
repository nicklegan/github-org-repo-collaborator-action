const core = require('@actions/core')
const github = require('@actions/github')
const { stringify } = require('csv-stringify/sync')
const arraySort = require('array-sort')
const token = core.getInput('token', { required: true })
const octokit = github.getOctokit(token)
const eventPayload = require(process.env.GITHUB_EVENT_PATH)
const org = core.getInput('org', { required: false }) || eventPayload.organization.login
const { owner, repo } = github.context.repo
const rolePermission = core.getInput('role', { required: false }) || 'ADMIN'
const committerName = core.getInput('committer-name', { required: false }) || 'github-actions'
const committerEmail = core.getInput('committer-email', { required: false }) || 'github-actions@github.com'

// Orchestrator
;(async () => {
  try {
    const collabs = []
    const emailArray = []
    const mergeArray = []
    await repoNames(collabs)
    await ssoCheck(emailArray)
    await mergeArrays(collabs, emailArray, mergeArray)
    await report(mergeArray)
  } catch (error) {
    core.setFailed(error.message)
  }
})()

// Query all organization repository names
async function repoNames(collabs) {
  try {
    let endCursor = null
    const query = /* GraphQL */ `
      query ($owner: String!, $cursorID: String) {
        organization(login: $owner) {
          repositories(first: 100, after: $cursorID) {
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
        await collabRole(repo, collabs)
        console.log(repo.name)
      }
    } while (hasNextPage)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Query all repository collaborator roles
async function collabRole(repo, collabs) {
  try {
    let endCursor = null
    const query = /* GraphQL */ `
      query ($owner: String!, $orgRepo: String!, $cursorID: String) {
        organization(login: $owner) {
          repository(name: $orgRepo) {
            collaborators(affiliation: ALL, first: 100, after: $cursorID) {
              edges {
                node {
                  login
                  name
                  email
                  organizationVerifiedDomainEmails(login: $owner)
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
        orgRepo: repo.name,
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
        const permission = role.permission
        const orgRepo = repo.name
        const visibility = repo.visibility

        if (role.permission === rolePermission) {
          collabs.push({ orgRepo, login, name, publicEmail, verifiedEmail, permission, visibility, org })
        }
      }
    } while (hasNextPage)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Check if organization has SSO enabled
async function ssoCheck(emailArray) {
  try {
    const query = `query ($org: String!) {
      organization(login: $org ) {
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

    const query = `query ($org: String! $cursorID: String) {
      organization(login: $org ) {
          samlIdentityProvider {
            externalIdentities(first:100 after: $cursorID) {
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
    } while (hasNextPageMember)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Append SSO email by login key
async function mergeArrays(collabs, emailArray, mergeArray) {
  try {
    collabs.forEach((collab) => {
      const login = collab.login
      const name = collab.name
      const publicEmail = collab.publicEmail
      const verifiedEmail = collab.verifiedEmail
      const permission = collab.permission
      const visibility = collab.visibility
      const org = collab.org
      const orgRepo = collab.orgRepo

      const ssoEmail = emailArray.find((email) => email.login === login)
      const ssoEmailValue = ssoEmail ? ssoEmail.ssoEmail : ''

      ssoCollab = { orgRepo, visibility, login, name, ssoEmailValue, publicEmail, verifiedEmail, permission, org }

      mergeArray.push(ssoCollab)
    })
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Create and push report for all organization collaborators
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
      permission: 'Role',
      org: 'Organization'
    }

    const sortArray = arraySort(mergeArray, 'orgRepo')

    const csv = stringify(sortArray, {
      header: true,
      columns: columns
    })

    const reportPath = `reports/${org}-repo-collaborator-report.csv`
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
