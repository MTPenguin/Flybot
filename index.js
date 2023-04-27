/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
const { encode } = require('js-base64')
const semver = require('semver')
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser')
const { Octokit } = require('octokit')
const session = require('express-session')
const fetch = require('node-fetch')
const path = require('path')
const thisFile = 'flybot/index.js'
const fs = require('fs')
const consoleLog = console.log

const getMigrationFiles = octokit => async ({ owner, repo, ref }) => {
  const DEBUG = true
  const REF = 'refs/heads/'
  const branchName = ~ref.indexOf(REF) ? ref.substring(String(REF).length) : ref
  const dir = `./_work/${branchName}`

  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true })
  }
  fs.mkdirSync(dir, { recursive: true });

  const { data: migrations } = await octokit.repos.getContent({
    owner,
    repo,
    ref,
    path: 'migrations',
  });
  DEBUG && consoleLog(thisFile, 'migrations:', migrations)
  for (const m of migrations) {
    const content = await octokit.request(m.download_url)
    // DEBUG && consoleLog(thisFile, 'm:', m, '\ncontent:', content)
    fs.writeFileSync(`${dir}/${m.name}`, content.data);
  }
}

// https://github.com/sindresorhus/execa#readme
// const fwCmdLn = async cmds => $`flyway -community -user=${process.env.DB_USERNAME} -password=${process.env.DB_PASSWORD} -configFiles=../flyway.conf -locations=filesystem:../migrations ${cmds} -url=${process.env.DB_JDBC} -outputType=json`
const fwCmdLn = $ => mDir => jdbc => async cmds => $`flyway -community -user=${process.env.DB_USERNAME} -password=${process.env.DB_PASSWORD} -baselineOnMigrate=true -baselineVersion=${process.env.FW_BASELINE_VERSION} -configFiles=../flyway.conf -locations=filesystem:${mDir} ${cmds} -url=${jdbc} -outputType=json`


module.exports = (app, { getRouter }) => {
  // const consoleLog = app.log.info
  consoleLog(thisFile, "Yay, the app was loaded!");

  /************************************************************************************************************************
    API & GUI routes
  *************************************************************************************************************************/
  const flybotURI = '/flybot'

  const router = getRouter(flybotURI)
  router.use(session({
    secret: process.env.CLIENT_SECRET,
    resave: true,
    saveUninitialized: true
  }));
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
  router.use(bodyParser.raw());
  router.use(cookieParser())

  router.get('/test.js', async (req, res) => {
    const scriptFile = path.join(__dirname, 'issue-ui/test.js')
    consoleLog(thisFile, 'scriptFile:', scriptFile)
    return res.sendFile(scriptFile);
  })

  router.get('/issue-ui/index.js', async (req, res) => {
    if (req.session.loggedIn) {
      const scriptFile = path.join(__dirname, 'issue-ui/index.js')
      consoleLog(thisFile, 'scriptFile:', scriptFile)
      return res.sendFile(scriptFile);
    }
    else {
      return res.redirect(flybotURI + '/login')
    }
  })

  router.get('/issue-ui/index.css', async (req, res) => {
    if (req.session.loggedIn) {
      const scriptFile = path.join(__dirname, 'issue-ui/index.css')
      consoleLog(thisFile, 'scriptFile:', scriptFile)
      return res.sendFile(scriptFile);
    }
    else {
      return res.redirect(flybotURI + '/login')
    }
  })

  router.get('/', async (req, res) => {
    const { body, query: { owner, repo } } = req
    consoleLog(thisFile, '/ req.cookies:', req.cookies)
    consoleLog(thisFile, '/ req.query:', req.query)
    consoleLog(thisFile, '/ owner, repo:', owner, repo)
    const o = owner || req.cookies.owner
    const r = repo || req.cookies.repo
    if (!(o && r)) {
      return res.status(404).send("Need both owner and repo params.  E.g. flybot?owner=MTPenguin&repo=AdvWorksComm")
    } else {
      res.cookie(`owner`, o);
      res.cookie(`repo`, r);
    }
    // http://72.250.142.109:3000/flybot?owner=MTPenguin&repo=AdvWorksComm
    // http://72.250.142.109:3000/flybot/logout
    if (req.session.loggedIn) {
      const flybotPath = path.join(__dirname, '/flybot.html')
      consoleLog(thisFile, 'flybotPath:', flybotPath)
      return res.sendFile(flybotPath);
      // return res.json({ loggedIn: req.session.loggedIn })
    }
    else {
      consoleLog(thisFile, '/ !loggedIn body:', body)
      consoleLog(thisFile, '/ req.session:', req.session)
      consoleLog(thisFile, '/ req.cookies:', req.cookies)
      return res.redirect(flybotURI + '/login')
    }
  })

  router.get('/login', async (req, res) => {
    consoleLog(thisFile, '/login cookies:', req.cookies)

    const searchParams = new URLSearchParams({
      client_id: process.env.CLIENT_ID
    });

    const url = `https://github.com/login/oauth/authorize?${searchParams.toString()}`
    res.redirect(url)
  })

  router.get('/logout', async (req, res) => {
    consoleLog(thisFile, '/logout req.session:', req.session)

    req.session.destroy(() => {
      consoleLog(thisFile, '/logout POST destroy req.session:', req.session)

      res.redirect('https://github.com/logout')
    })
  })

  router.get('/login/cb', async (req, res) => {
    consoleLog(thisFile, '/login/cb req.query.code:', req.query.code)
    consoleLog(thisFile, '/login/cb req.query:', req.query)
    consoleLog(thisFile, '/login/cb req.cookies:', req.cookies)

    // Exchange our "code" and credentials for a real token
    fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        accept: "application/json"
        // 'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: JSON.stringify({ client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, code: req.query.code })
    })
      .then(async res => {
        consoleLog(thisFile, '/login/cb res.status:', res.status)
        // const json = await res.json()
        const text = await res.text()
        consoleLog(thisFile, '/login/cb text:', text)
        return JSON.parse(text)
      }) // expecting a json response
      .then(async json => {
        console.log(thisFile, '/login/cb THEN json:', json)
        // Authenticate our Octokit client with the new token
        const token = json.access_token
        const octokit = new Octokit({ auth: token })

        // Get the currently authenticated user
        const user = await octokit.rest.users.getAuthenticated()
        consoleLog(thisFile, '***********   user.data.login:', user.data.login) // <-- This is what we want!
        consoleLog(thisFile, '***********   req.cookies:', req.cookies) // <-- This is what we want!
        req.session.loggedIn = true
        req.session.user = user
        req.session.token = token
        return res.redirect(flybotURI)
      })
      .catch(error => {
        console.error(error.message, error)
      })

  })

  router.post('/:owner/:repo/createIssue', async (req, res) => {
    const { body, params: { owner, repo } } = req
    consoleLog(thisFile, '/createIssue req.cookies:', req.cookies)
    consoleLog(thisFile, '/createIssue req.query:', req.query)
    consoleLog(thisFile, '/createIssue owner, repo:', owner, repo)
    consoleLog(thisFile, '/createIssue body:', body)

    if (!req.session.loggedIn) {
      consoleLog(thisFile, '/createIssue !loggedIn body:', body)
      consoleLog(thisFile, '/createIssue req.session:', req.session)
      consoleLog(thisFile, '/createIssue req.cookies:', req.cookies)
      return res.redirect(flybotURI + '/login')
    }

    // Probot / GH App octokit
    const octokit = await app.auth()
    let raw
    const { data: authData } = raw = await octokit.apps.getAuthenticated()
    // consoleLog(thisFile, '/createIssue raw:', raw)
    consoleLog(thisFile, '/createIssue authData:', authData)


    const o = owner || req.cookies.owner
    const r = repo || req.cookies.repo
    const b = (body && JSON.stringify(Object.assign({}, body, { user: req.session.user.data.login }))) || req.cookies.body
    if (!(o && r)) {
      return res.status(404).send("Need both owner and repo params")
    } else {
      res.cookie(`owner`, o)
      res.cookie(`repo`, r)
      res.cookie('body', b)
    }
    // http://72.250.142.109:3000/flybot?owner=MTPenguin&repo=AdvWorksComm
    // http://72.250.142.109:3000/flybot/logout?owner=MTPenguin&repo=AdvWorksComm

    // installationId option is required for installation authentication.
    // To create issue from external event
    const { data: { id } } = raw = await octokit.apps.getRepoInstallation({
      owner,
      repo,
    });
    // consoleLog(thisFile, '/createIssue raw:', raw)
    consoleLog(thisFile, '/createIssue id:', id)

    const installationOctokit = await app.auth(id)


    result = await installationOctokit.rest.issues.create({
      owner,
      repo,
      title: 'Issue created by UI',
      body: `Issue Body \`\`\`${b}\`\`\``
    });
    consoleLog(thisFile, '/createIssue issue create result:', result)
    res.json(result)
  })

  router.get('/whoami', async (req, res) => {
    const octokit = await app.auth()
    const { data } = await octokit.apps.getAuthenticated()
    res.json(data)
  })



  /************************************************************************************************************************************
  *            Event handlers
  ************************************************************************************************************************************/

  /*******************                  ON ISSUES                  *******************/
  app.on("issues", async (context) => {
    const octokit = context.octokit
    const payload = context.payload
    const repository = payload.repository
    const owner = repository.owner.login
    const repo = repository.name
    const issueBody = payload.issue.body

    const DEBUG = true

    DEBUG && consoleLog(thisFile, 'issues.opened context.name & .id:', context.name, context.id)

    if (!['opened', 'edited'].includes(payload.action)) return

    /**
     * Does issue body contain valid json?
     */
    const firstT = issueBody.indexOf('```')
    const lastT = issueBody.lastIndexOf('```')
    let jsonBody
    if (~firstT && ~lastT) {
      try {
        jsonBody = issueBody.substr(firstT + 3, (lastT - firstT) - 3)
        DEBUG && consoleLog(thisFile, 'jsonBody:', jsonBody)
        jsonBody = JSON.parse(jsonBody)
      } catch (error) {
        console.error('Throwing:', error.message)
        throw error
      }
      DEBUG && consoleLog(thisFile, 'jsonBody:', jsonBody)
    } else {
      DEBUG && consoleLog(thisFile, 'firstT:', firstT, 'lastT:', lastT)
      throw new Error('No JSON body')
    }

    if (!(jsonBody.jira && jsonBody.scope)) throw new Error('Missing parameter(s) jsonBody.jira && jsonBody.scope ' + JSON.stringify(jsonBody))
    // Already done
    if (payload.action === 'edited' && jsonBody.newVersion) return


    /**
     * Get current version
     */
    const tags = await octokit.request(repository.tags_url)
    DEBUG && consoleLog(thisFile, 'tags:', tags)
    const tagsSorted = semver.rsort(tags.data.map(d => d.name))
    DEBUG && consoleLog(thisFile, 'tagsSorted:', tagsSorted)
    const currentVersion = tagsSorted[0]
    DEBUG && consoleLog(thisFile, 'currentVersion:', currentVersion)

    /**
    * Flyway Date Stamp yyyy-MM-dd HH:mm:ss
    */
    const dateNow = new Date()
    const dateStamp = dateNow.getUTCFullYear() + String(dateNow.getUTCMonth() + 1).padStart(2, '0') + String(dateNow.getUTCDate()).padStart(2, '0')
      + String(dateNow.getUTCHours()).padStart(2, '0') + String(dateNow.getUTCMinutes()).padStart(2, '0') + String(dateNow.getUTCSeconds()).padStart(2, '0')
    DEBUG && consoleLog(thisFile, 'dateStamp:', dateStamp)

    let level
    let newVersion
    const currentMajor = semver.major(currentVersion)
    const currentMinor = semver.minor(currentVersion)
    switch (jsonBody.scope) {
      case 'data':
        level = 'patch'
        newVersion = currentMajor + '.' + currentMinor + '.' + dateStamp
        break
      case 'refData':
        level = 'minor'
        newVersion = semver.inc(currentVersion, level)
        break
      case 'schema':
        level = 'major'
        newVersion = semver.inc(currentVersion, level)
    }
    DEBUG && consoleLog(thisFile, 'level:', level)
    DEBUG && consoleLog(thisFile, 'newVersion:', newVersion)

    /**
     * In order to create a new branch off of default, we first have to get the sha of mergeBranch
     */
    const mergeBranch = await octokit.request(repository.branches_url, { branch: repository.default_branch })
    DEBUG && consoleLog(thisFile, 'mergeBranch:', mergeBranch)

    /* DEBUG ADD LIGHT TAG REF */
    // await octokit.git.createRef({
    //   owner,
    //   repo,
    //   ref: 'refs/tags/v1.0.' + dateStamp,
    //   sha: mergeBranch.data.commit.sha
    // })


    // GITHUB_ISSUE-JIR-000-SCOPE-CURRENT_VERSION
    const newBranch = payload.issue.number + '-' + jsonBody.jira + '-' + jsonBody.scope + '-' + currentVersion
    const newMigration = 'V' + newVersion + '__' + newBranch
    DEBUG && consoleLog(thisFile, 'newBranch:', newBranch)
    DEBUG && consoleLog(thisFile, 'newMigration:', newMigration)


    // Create a new branch
    try {
      let result = await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${newBranch}`,
        sha: mergeBranch.data.commit.sha,
        key: payload.issue.number
      });
    } catch (error) {
      console.error(thisFile, 'New Branch', error.message)
      // Create a new issue comment
      const issueComment = context.issue({
        body: error.message,
      });
      result = await octokit.issues.createComment(issueComment);
      DEBUG && consoleLog(thisFile, 'issue ERROR comment result:', result)
      throw error
    }
    DEBUG && consoleLog(thisFile, 'branch result:', result)


    //[ Resolves #<issue_number> ] links the commit to the issue.  When the commit is merged, it should close the issue.
    // TODO Trying to get the linked branch to show up under 'Development' in the GitHub Issue UI
    let message = `Resolves #${payload.issue.number} - Created ${newMigration}.sql file - [skip actions]}`
    let content = "--flybot created " + newMigration
    if (jsonBody.debug ?? false) {
      content += "\n-- DEBUG ---\n"
      const debugVal = dateStamp.substring(dateStamp.length - 10, 10)
      content += `PRINT(N'Update 6 rows in [SalesLT].[Customer]')
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 1
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 2
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 3
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 4
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 5
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 6
    `
      content += "-- DEBUG ---\n\n\n"
    }

    result = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      branch: newBranch,
      path: 'migrations/' + newMigration + '.sql',
      message,
      content: encode(content)
    })
    DEBUG && consoleLog(thisFile, 'migration file result:', result)

    content = {
      ...jsonBody,
      newBranch,
      currentVersion,
      currentMajor,
      currentMinor,
      dateStamp,
      newVersion
    }
    DEBUG && consoleLog(thisFile, 'content:', content)

    // Create a new issue comment
    let commentBody = `Thank you ${payload.issue.user.login} for creating issue #${payload.issue.number}, Jira:[${jsonBody.jira}](${process.env.JIRA_BROWSE_URL}/${jsonBody.jira})!\n\n\n`
    commentBody += "A new branch (["
    commentBody += newBranch
    commentBody += "](https://github.com/MTPenguin/AdvWorksComm/tree/"
    commentBody += newBranch
    commentBody += ")) has been created for this migration."
    const issueComment = context.issue({
      body: commentBody,
    });
    result = await octokit.issues.createComment(issueComment);
    DEBUG && consoleLog(thisFile, 'issue comment result:', result)


    // Update issue JSON
    const body = `\`\`\`${JSON.stringify(content)}\`\`\``
    DEBUG && consoleLog(thisFile, 'body:', body)
    result = await octokit.issues.update({
      owner,
      repo,
      issue_number: payload.issue.number,
      title: newBranch,
      body,
      // state: 'open',
      labels: [jsonBody.jira, jsonBody.scope],
      // DEBUG try to link branch
      // development: {
      //   branch: newBranch
      // }
    });
    DEBUG && consoleLog(thisFile, 'issue update result:', result)
  });

  /*******************                  ON PUSH                  *******************/
  app.on('push', async (context) => {
    const commits = context.payload.commits
    const octokit = context.octokit
    const payload = context.payload
    const repository = payload.repository
    const owner = repository.owner.login
    const repo = repository.name
    const branchName = payload.ref.substring(String('refs/heads/').length)
    const { $ } = await import('execa')

    const DEBUG = true
    DEBUG && consoleLog(thisFile, 'push context.name & .id:', context.name, context.id)
    // DEBUG && consoleLog(thisFile, 'Push event payload:', payload)

    // SKIP IF
    if (payload.head_commit.message.includes('[skip actions]')) {
      consoleLog(thisFile, 'SKIP action')
      return
    }

    if (branchName.match(/[0-9]+-[a-zA-Z]+-[0-9]+-data|refData|schema-/)) {
      DEBUG && consoleLog(thisFile, 'Matched branch')
      // Look for migration file changes
      DEBUG && consoleLog(thisFile, 'commits:', commits)
      let matchedFile = false
      for (const commit of commits) {
        if (matchedFile) break
        for (const mod of commit.modified) {
          if (mod.match(/^migrations\/V/)) {
            matchedFile = mod
            break
          }
        }
      }
      if (matchedFile) {
        DEBUG && consoleLog(thisFile, 'matched file:', matchedFile)
        // 
        // MIGRATION FILE CHANGE DETECTED
        // 
        try {
          // Get migration files
          const dir = `./_work/${branchName}`
          await getMigrationFiles(octokit)({ owner, repo, ref: payload.ref })
          // Check with Flyway
          const infoResult = await fwCmdLn($)(dir)(process.env.DB_JDBC)('info')
          DEBUG && consoleLog(thisFile, 'infoResult:', infoResult);
          const infoJson = JSON.parse(infoResult.stdout)
          const pending = infoJson.migrations.findIndex(m => m.state === 'Pending')
          if (~pending) {
            DEBUG && consoleLog(thisFile, 'Pending Migrations')
            // Now check if we can clean and build
            const cleanResult = await fwCmdLn($)(dir)(process.env.DB_BUILD_JDBC)('clean')
            DEBUG && consoleLog(thisFile, 'cleanResult:', cleanResult);
            const cleanJson = JSON.parse(cleanResult.stdout)
            const buildResult = await fwCmdLn($)(dir)(process.env.DB_BUILD_JDBC)('migrate')
            DEBUG && consoleLog(thisFile, 'buildResult:', buildResult);
            const buildJson = JSON.parse(buildResult.stdout)

            DEBUG && consoleLog(thisFile, 'cleanJson:', cleanJson, '\nbuildJson:', buildJson);

            // And create PR
            const prResult = await octokit.pulls.create({
              owner,
              repo,
              head: payload.ref,
              base: repository.default_branch,
              title: `Merge ${branchName} into ${repository.default_branch}`,
              body: 'Pull request created by Flybot Github application.\n\nInfo:\n```\n' + JSON.stringify(infoJson, null, 4) + '\n```',
              auto_merge: true
            })
            DEBUG && consoleLog(thisFile, 'PR prResult:', prResult)
            DEBUG && consoleLog(`Pull request created: ${prResult.data.html_url}`)

            // See if we can enable auto-merge with graphql
            // Get the id
            const idResult = await context.octokit.graphql(`
            query getPrId {
              repository(name: "${repo}", owner: "${owner}") {
                  pullRequest(number: ${prResult.data.number}) {
                            id
                        }
                  } 
            }
            `)
            DEBUG && consoleLog(thisFile, 'PR idResult:', idResult)
            const enableAutoMerge = `
                mutation autoMerge ($pullRequestId: ID!) {
                  enablePullRequestAutoMerge(input: {pullRequestId: $pullRequestId, mergeMethod: MERGE}) {
                    clientMutationId
                  }
                }
                `

            const gqlResult = await context.octokit.graphql(enableAutoMerge, {
              pullRequestId: idResult.repository.pullRequest.id,
            })
            DEBUG && consoleLog(thisFile, 'PR gqlResult:', gqlResult)
            // Cleanup
            if (fs.existsSync(dir)) {
              fs.rmSync(dir, { recursive: true })
            }
          } else DEBUG && consoleLog(thisFile, 'NO Migrations')
        } catch (error) {
          console.error(thisFile, 'FW:', error.message)
          throw error
        }
      } else DEBUG && consoleLog(thisFile, 'NO matched files:', commits)
    } else DEBUG && consoleLog(thisFile, 'NON matched branchName:', branchName)
  });

  /*******************                  ON PULL_REQUEST_REVIEW                 *******************/
  app.on('pull_request_review', async (context) => {
    const octokit = context.octokit
    const payload = context.payload
    const repository = payload.repository
    const owner = repository.owner.login
    const repo = repository.name
    const prState = payload.review.state
    const ref = payload.pull_request.head.ref
    const { $ } = await import('execa')

    const DEBUG = true
    DEBUG && consoleLog(thisFile, 'pull_request_review context.name & .id:', context.name, context.id)
    DEBUG && consoleLog(thisFile, 'pull_request_review payload:', payload)
    DEBUG && consoleLog(thisFile, 'pull_request_review payload.pull_request:', payload.pull_request)

    if (prState === 'approved') {
      const chkNew = await octokit.rest.checks.create({
        owner,
        repo,
        name: 'Run migration on default branch',
        head_sha: payload.pull_request.head.sha
      })
      DEBUG && consoleLog(thisFile, 'pull_request_review create chkNew:', chkNew)

      // FIND EXISTING
      // const chkSuites = await octokit.rest.checks.listSuitesForRef({
      //   owner,
      //   repo,
      //   ref,
      // });
      // DEBUG && consoleLog(thisFile, 'pull_request_review chkSuites.data.check_suites:', chkSuites.data.check_suites)
      // const chkRuns = await octokit.rest.checks.listForSuite({
      //   owner,
      //   repo,
      //   check_suite_id: chkSuites.data.check_suites[chkSuites.data.check_suites.length - 1]?.id,
      // });
      // DEBUG && consoleLog(thisFile, 'pull_request_review chkRuns.data.check_runs:', chkRuns.data.check_runs)




      // Get issue JSON
      const issue = await octokit.issues.get({
        owner,
        repo,
        issue_number: payload.pull_request.head.ref.substr(0, payload.pull_request.head.ref.indexOf('-'))
      });
      DEBUG && consoleLog(thisFile, 'pull_request_review issue:', issue)
      const bodyStart = issue.data.body.indexOf('```') + 3
      const bodyEnd = issue.data.body.lastIndexOf('```')
      const versionObj = JSON.parse(issue.data.body.substring(bodyStart, bodyEnd))
      DEBUG && consoleLog(thisFile, 'pull_request_review versionObj:', versionObj)

      // Get version information
      const filePath = `./_work/${ref}/V${versionObj.newVersion}__${ref}.sql`
      DEBUG && consoleLog(thisFile, 'pull_request_review filePath:', filePath)

      // Get migration files
      await getMigrationFiles(octokit)({ owner, repo, ref: payload.pull_request.head.ref })

      const content = fs.readFileSync(filePath, { encoding: 'utf8' });
      DEBUG && consoleLog(thisFile, 'pull_request_review content:', content)
      const expectedVersion = versionObj.expectedVersion ? versionObj.expectedVersion : versionObj.currentVersion.substring(1, versionObj.currentVersion.length - 1)
      DEBUG && consoleLog(thisFile, 'pull_request_review expectedVersion:', expectedVersion)
      const prepend = `
            Declare @version varchar(25);
            SELECT @version= Coalesce(Json_Value(
              (SELECT Convert(NVARCHAR(3760), value) 
              FROM sys.extended_properties AS EP
              WHERE major_id = 0 AND minor_id = 0 
                AND name = 'Database_Info'), '$[0].Version'), 'that was not recorded');
            -- PARSENAME USED TO ONLY COMPARE MAJOR AND MINOR
            IF PARSENAME(@version, 3) + PARSENAME(@version, 2)  <> PARSENAME('${expectedVersion}', 3) + PARSENAME('${expectedVersion}', 2)
            BEGIN
            RAISERROR ('The Target was at version %s, not the correct version (${expectedVersion})',16,1,@version)
            SET NOEXEC ON;
            END
      `
      const postpend = `
             PRINT N'Creating extended properties'
             SET NOEXEC off
             go
             USE AdvWorksComm
             DECLARE @DatabaseInfo NVARCHAR(3750), @version NVARCHAR(20)
             SET @version=N'${versionObj.newVersion}'
             PRINT N'New version === ' + @version
             SELECT @DatabaseInfo =
               (
               SELECT 'AdvWorksComm' AS "Name", @version  AS "Version",
               'The AdvWorksComm.' AS "Description",
                 GetDate() AS "Modified",
             SUser_Name() AS "by"
               FOR JSON PATH
               );

             IF not EXISTS
               (SELECT name, value  FROM fn_listextendedproperty(
                 N'Database_Info',default, default, default, default, default, default) )
                 EXEC sys.sp_addextendedproperty @name=N'Database_Info', @value=@DatabaseInfo
             ELSE
               EXEC sys.sp_Updateextendedproperty  @name=N'Database_Info', @value=@DatabaseInfo
           `
      fs.writeFileSync(filePath, prepend + content + postpend)

      // Runs the Flyway repair to update the checksum for above changes to pass validation
      // flyway -community -user="${{ env.userName }}" -password="${{ env.password }}" -baselineOnMigrate="true" -baselineVersion="${{ vars.BASELINE_VERSION }}" -configFiles="${{ GITHUB.WORKSPACE }}\flyway.conf" -locations="filesystem:${{ github.WORKSPACE }}\\migrations, filesystem:${{ github.WORKSPACE }}\\migrations-${{ env.deployment_environment }}" info repair info -url="${{ env.JDBC }}" -cleanDisabled='false'
      const repairResult = await fwCmdLn($)(filePath)(process.env.DB_JDBC)('repair')
      DEBUG && consoleLog(thisFile, 'pull_request_review repairResult:', repairResult)

      // Runs the Flyway Migrate against the Production database
      // flyway - community - user="${{ env.userName }}" - password="${{ env.password }}" - baselineOnMigrate="true" - baselineVersion="${{ vars.BASELINE_VERSION }}" - configFiles="${{ GITHUB.WORKSPACE }}\flyway.conf" - locations="filesystem:${{ github.WORKSPACE }}\\migrations, filesystem:${{ github.WORKSPACE }}\\migrations-${{ env.deployment_environment }}" info migrate info - url="${{ env.JDBC }}" - cleanDisabled='false'
      const migrateResult = await fwCmdLn($)(filePath)(process.env.DB_JDBC)('migrate')
      DEBUG && consoleLog(thisFile, 'pull_request_review migrateResult:', migrateResult)


      const chkUpdate = await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: chkNew.data.id, // chkRuns.data.check_runs[0]?.id, 
        conclusion: 'success',
        output: {
          summary: 'Output data here',
          title: 'Check Summary'
        }, actions: [{
          label: 'Action Button',
          description: 'This button triggers an event in flyBot',
          identifier: 'i1'
        }]
      })
      // DEBUG && consoleLog(thisFile, 'pull_request_review chkUpdate:', chkUpdate)
      // DEBUG && consoleLog(thisFile, 'pull_request_review chkUpdate?.data:', chkUpdate?.data)
    }
  })

  /*******************                  ON REQUESTED_ACTION                 *******************/
  app.on('check_run', async (context) => {
    const octokit = context.octokit
    const payload = context.payload
    const repository = payload.repository
    const owner = repository.owner.login
    const repo = repository.name

    const DEBUG = true

    if (payload.action === 'requested_action') {
      DEBUG && consoleLog(thisFile, 'requested_action context.name & .id:', context.name, context.id)
      DEBUG && consoleLog(thisFile, 'requested_action payload:', payload)
    }
  })

  /*******************                  ON ANY FOR DEBUG                 *******************/
  app.onAny(async (context) => {
    const octokit = context.octokit
    const payload = context.payload
    const repository = payload.repository
    const owner = repository.owner.login
    const repo = repository.name

    const array = ['issues', 'issue_comment', 'push', 'pull_request_review', 'check_run']
    const DEBUG = !array.includes(context.name)
    DEBUG && consoleLog(thisFile, 'onAny context.name & .id:', context.name, context.id)
    DEBUG && consoleLog(thisFile, 'onAny array:', array)
    // DEBUG && consoleLog(thisFile, 'onAny payload:', payload)
  })
}

